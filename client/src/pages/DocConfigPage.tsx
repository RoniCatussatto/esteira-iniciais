import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  ArrowLeft, Send, Upload, FileText, X, Loader2,
  CheckCircle, Bot, User, Paperclip, Trash2, Save,
} from "lucide-react";
import { Link } from "wouter";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ArquivoModelo = {
  nome: string;
  url: string;
  key: string;
  mimeType?: string;
};

export default function DocConfigPage() {
  const { clienteId, docConfigId } = useParams<{ clienteId: string; docConfigId: string }>();
  const [, navigate] = useLocation();

  const isNew = docConfigId === "novo";
  const docId = isNew ? null : parseInt(docConfigId);

  // Dados do docConfig existente (se editando)
  const { data: docConfig, isLoading: loadingConfig } = trpc.docConfigs.getById.useQuery(
    { id: docId! },
    { enabled: !isNew && !!docId }
  );
  const { data: cliente } = trpc.clientes.getById.useQuery(
    { id: parseInt(clienteId) },
    { enabled: !!clienteId }
  );

  const createDocConfig = trpc.docConfigs.create.useMutation();
  const updateDocConfig = trpc.docConfigs.update.useMutation();
  const utils = trpc.useUtils();

  // Estado do chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [nomeDocumento, setNomeDocumento] = useState("");
  const [arquivosModelo, setArquivosModelo] = useState<ArquivoModelo[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [configSalva, setConfigSalva] = useState(false);
  const [currentDocConfigId, setCurrentDocConfigId] = useState<number | null>(docId);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Inicializar com dados existentes
  useEffect(() => {
    if (docConfig) {
      setNomeDocumento(docConfig.nomeDocumento);
      if (docConfig.historicoChat) {
        try { setMessages(JSON.parse(docConfig.historicoChat)); } catch { /* ignore */ }
      }
      if (docConfig.arquivosModelo) {
        try { setArquivosModelo(JSON.parse(docConfig.arquivosModelo)); } catch { /* ignore */ }
      }
      if (docConfig.statusConfig === "configurado" || docConfig.statusConfig === "testado") {
        setConfigSalva(true);
      }
    }
  }, [docConfig]);

  // Mensagem inicial da IA
  useEffect(() => {
    if (messages.length === 0 && !loadingConfig) {
      const intro = isNew
        ? `Olá! Vou ajudá-lo a configurar a extração de dados de um novo tipo de documento para ${cliente?.nomeFantasia || "esta cliente"}.\n\nPara começar:\n1. **Qual o nome** que você quer dar a este tipo de documento? (ex: CCB, Fatura, Extrato Sisbr)\n2. Se quiser, **faça o upload de arquivos modelo** usando o botão de clipe acima — assim posso analisar o formato real do documento.\n3. Me diga **quais dados** você quer extrair deste documento.`
        : `Olá! Estou aqui para ajudá-lo a editar a configuração do documento **${docConfig?.nomeDocumento}**.\n\nO que você gostaria de ajustar?`;
      setMessages([{ role: "assistant", content: intro }]);
    }
  }, [loadingConfig, isNew, cliente, docConfig]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Upload de arquivo modelo
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/docs/single-file", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Falha no upload");
        const data = await res.json() as { url: string; key: string };
        setArquivosModelo(prev => [...prev, {
          nome: file.name,
          url: data.url,
          key: data.key,
          mimeType: file.type,
        }]);
        toast.success(`Arquivo "${file.name}" enviado`);
      }
    } catch (err) {
      toast.error("Erro ao fazer upload do arquivo");
    } finally {
      setUploadingFile(false);
    }
  };

  // Enviar mensagem e fazer streaming
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    // Criar docConfig se for novo e ainda não criado
    let activeDocConfigId = currentDocConfigId;
    if (!activeDocConfigId) {
      if (!nomeDocumento.trim()) {
        toast.error("Informe o nome do documento antes de enviar a primeira mensagem");
        return;
      }
      try {
        const created = await createDocConfig.mutateAsync({
          clienteId: parseInt(clienteId),
          nomeDocumento: nomeDocumento.trim(),
        });
        activeDocConfigId = created.id;
        setCurrentDocConfigId(created.id);
        utils.docConfigs.getByCliente.invalidate({ clienteId: parseInt(clienteId) });
      } catch (err) {
        toast.error("Erro ao criar configuração");
        return;
      }
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText("");
    setIsStreaming(true);

    // Placeholder da resposta da IA
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    abortRef.current = new AbortController();
    let fullContent = "";

    try {
      const res = await fetch("/api/doc-config-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          docConfigId: activeDocConfigId,
          arquivosModelo,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Erro na requisição");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem body");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) {
                fullContent += parsed.delta;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullContent };
                  return updated;
                });
              }
              if (parsed.done) {
                // Usar o fullContent do servidor (mais confiável que o acumulado no cliente)
                if (parsed.fullContent) {
                  fullContent = parsed.fullContent;
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: fullContent };
                    return updated;
                  });
                }
                streamDone = true;
              }
              if (parsed.error) throw new Error(parsed.error);
            } catch (parseErr) {
              // Ignorar erros de parse de chunks individuais, mas logar para debug
              if (parseErr instanceof SyntaxError) { /* chunk incompleto, normal */ }
              else throw parseErr;
            }
          }
        }
        if (streamDone) break;
      }

      // Verificar se a resposta contém CONFIG_FINAL
      const configMatch = fullContent.match(/<CONFIG_FINAL>([\s\S]*?)<\/CONFIG_FINAL>/);
      if (configMatch) {
        try {
          // Remover blocos de código markdown (```json ... ``` ou ``` ... ```) antes do parse
          let rawJson = configMatch[1].trim();
          rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          const configData = JSON.parse(rawJson);
          // Salvar configuração automaticamente
          const saveResp = await fetch("/api/doc-config-chat/save-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docConfigId: activeDocConfigId,
              configJson: configData,
              regrasIdentificacao: configData.regrasIdentificacao,
              mapeamentoCampos: configData.mapeamentoCampos,
              historicoChat: [...newMessages, { role: "assistant", content: fullContent }],
              arquivosModelo,
              statusConfig: "configurado",
            }),
          });
          if (saveResp.ok) {
            setConfigSalva(true);
            utils.docConfigs.getByCliente.invalidate({ clienteId: parseInt(clienteId) });
            toast.success("Configuração salva automaticamente!");
          } else {
            const errText = await saveResp.text();
            console.error("[DocConfigPage] Erro ao salvar configuração:", saveResp.status, errText);
            toast.error("Erro ao salvar configuração: " + saveResp.status);
          }
        } catch (saveErr) {
          console.error("[DocConfigPage] Exceção ao salvar configuração:", saveErr);
          toast.error("Erro ao salvar configuração");
        }
      }

      // Salvar histórico do chat
      const finalMessages = [...newMessages, { role: "assistant" as const, content: fullContent }];
      await fetch("/api/doc-config-chat/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docConfigId: activeDocConfigId,
          historicoChat: finalMessages,
          arquivosModelo,
        }),
      });

    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Erro na comunicação com a IA");
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, messages, arquivosModelo, currentDocConfigId, nomeDocumento, clienteId, createDocConfig, utils]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/configuracoes">
            <Button variant="ghost" size="sm" className="gap-1.5 text-gray-600">
              <ArrowLeft className="w-4 h-4" />
              Configurações
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">
                {isNew ? "Configurar novo documento" : `Editar: ${docConfig?.nomeDocumento}`}
              </h1>
              {configSalva && (
                <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Configurado
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {cliente?.nomeFantasia} — Chat com IA para configurar extração de dados
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-6 flex flex-col gap-4" style={{ minHeight: 0 }}>
        {/* Nome do documento (apenas para novo) */}
        {isNew && !currentDocConfigId && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do tipo de documento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nomeDocumento}
              onChange={e => setNomeDocumento(e.target.value)}
              placeholder="Ex: CCB, CCBE, Fatura, Extrato Sisbr, Ficha Gráfica..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Este nome será usado para identificar o tipo de documento no sistema.
            </p>
          </div>
        )}

        {/* Arquivos modelo */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Arquivos modelo</h3>
              <p className="text-xs text-gray-500">Envie exemplos do documento para a IA analisar o formato</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => handleFileUpload(e.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="gap-1.5"
              >
                {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                Anexar arquivo
              </Button>
            </div>
          </div>
          {arquivosModelo.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nenhum arquivo modelo enviado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {arquivosModelo.map((arq, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                  <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <a href={arq.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:underline max-w-[200px] truncate">
                    {arq.nome}
                  </a>
                  <button
                    onClick={() => setArquivosModelo(prev => prev.filter((_, j) => j !== i))}
                    className="text-blue-400 hover:text-red-500 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 flex flex-col" style={{ minHeight: "400px" }}>
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "assistant" ? "bg-blue-100" : "bg-gray-100"
                }`}>
                  {msg.role === "assistant"
                    ? <Bot className="w-4 h-4 text-blue-600" />
                    : <User className="w-4 h-4 text-gray-600" />
                  }
                </div>
                <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                  msg.role === "assistant"
                    ? "bg-gray-50 border border-gray-200 text-gray-800"
                    : "bg-blue-600 text-white"
                }`}>
                  {msg.role === "assistant" ? (
                    msg.content
                      ? <Streamdown>{msg.content}</Streamdown>
                      : <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-3 flex gap-2">
            <Textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              className="flex-1 min-h-[60px] max-h-[120px] resize-none text-sm"
              disabled={isStreaming}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputText.trim() || isStreaming}
              className="self-end"
            >
              {isStreaming
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </Button>
          </div>
        </div>

        {/* Dica */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>Como usar:</strong> Informe o nome do documento, envie arquivos modelo se tiver, e descreva quais dados quer extrair e onde eles aparecem. A IA vai gerar a configuração de extração automaticamente. Quando a configuração estiver pronta, ela será salva automaticamente.
        </div>
      </div>
    </div>
  );
}
