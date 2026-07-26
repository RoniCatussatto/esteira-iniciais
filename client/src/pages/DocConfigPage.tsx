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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

type CampoExtracao = {
  campo: "dadoPlanilha01" | "dadoPlanilha02" | "dadoPlanilha03" | "dadoPlanilha04" | "moraEspecifica";
  descricao: string;
  localizacao: string;
  dica: string;
};

type FormularioConfig = {
  identificacaoPalavras: string;
  contratoNoNome: "sim" | "nao" | "";
  camposExtracao: CampoExtracao[];
  multa2pct: "sim" | "nao" | "extrair" | "";
  moraFonte: "extrair" | "outro" | "";
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

  // Formulário guiado
  const [mostrarFormulario, setMostrarFormulario] = useState(true);
  const [formulario, setFormulario] = useState<FormularioConfig>({
    identificacaoPalavras: "",
    contratoNoNome: "",
    camposExtracao: [{ campo: "dadoPlanilha01", descricao: "", localizacao: "", dica: "" }],
    multa2pct: "",
    moraFonte: "",
  });

  // Gerar prompt estruturado a partir do formulário
  const gerarPromptDoFormulario = () => {
    const f = formulario;
    const camposTexto = f.camposExtracao
      .filter(c => c.descricao.trim())
      .map(c => {
        let linha = `- **${c.campo}** = ${c.descricao.trim()}`;
        if (c.localizacao.trim()) linha += ` (localização: ${c.localizacao.trim()})`;
        if (c.dica.trim()) linha += ` — dica: ${c.dica.trim()}`;
        return linha;
      })
      .join("\n");

    const multaTexto =
      f.multa2pct === "sim" ? "Multa 2%: SEMPRE SIM para este tipo de documento." :
      f.multa2pct === "nao" ? "Multa 2%: SEMPRE NÃO para este tipo de documento." :
      f.multa2pct === "extrair" ? "Multa 2%: extrair do conteúdo do documento." :
      "";

    const moraTexto =
      f.moraFonte === "extrair" ? "Mora Específica: extrair deste documento." :
      f.moraFonte === "outro" ? "Mora Específica: será extraída de outro documento, não configurar aqui." :
      "";

    const contratoTexto = f.contratoNoNome === "sim"
      ? "O número do contrato aparece no nome do arquivo (ex: FATURA - 330525.pdf → contrato 330525). O sistema já detecta automaticamente. Coloque o número do contrato também no Dado Planilha 02 usando o número extraído do nome do arquivo."
      : f.contratoNoNome === "nao"
      ? "O número do contrato NÃO aparece no nome do arquivo."
      : "";

    return [
      `Quero configurar a extração do documento **${nomeDocumento || "este documento"}**.`,
      "",
      `**Identificação:** o arquivo tem "${f.identificacaoPalavras}" no título.`,
      "",
      contratoTexto ? `**Vinculação ao contrato:** ${contratoTexto}` : "",
      "",
      camposTexto ? `**Dados a extrair:**\n${camposTexto}` : "",
      "",
      multaTexto,
      moraTexto,
      "",
      "Gere a configuração JSON completa.",
    ].filter(l => l !== "").join("\n").trim();
  };

  const enviarFormulario = () => {
    const prompt = gerarPromptDoFormulario();
    setInputText(prompt);
    setMostrarFormulario(false);
  };

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
          // Estratégia robusta para extrair JSON do conteúdo retornado pelo LLM:
          // 1. Tentar extrair bloco ```json ... ``` de qualquer posição no texto
          // 2. Se não encontrar, tentar extrair o primeiro objeto JSON { ... }
          // 3. Fallback: usar o texto completo limpo
          let rawJson = configMatch[1].trim();
          const codeBlockMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/i);
          if (codeBlockMatch) {
            rawJson = codeBlockMatch[1].trim();
          } else {
            // Remover possíveis marcadores de início/fim de bloco soltos
            rawJson = rawJson.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();
          }
          // Extrair o primeiro objeto JSON completo { ... } se ainda houver texto ao redor
          if (!rawJson.startsWith("{")) {
            const jsonObjMatch = rawJson.match(/(\{[\s\S]*\})/);
            if (jsonObjMatch) rawJson = jsonObjMatch[1].trim();
          }
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
        {/* Formulário guiado */}
        {isNew && mostrarFormulario && (
          <div className="bg-white rounded-lg border border-blue-200 shadow-sm">
            <div className="px-5 py-4 border-b border-blue-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-blue-900">Assistente de configuração guiada</h2>
                <p className="text-xs text-blue-600 mt-0.5">Preencha os campos abaixo para gerar automaticamente as instruções para a IA</p>
              </div>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600" onClick={() => setMostrarFormulario(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-5 space-y-5">
              {/* Nome do documento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do tipo de documento <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nomeDocumento}
                  onChange={e => setNomeDocumento(e.target.value)}
                  placeholder="Ex: Fatura, CCB, Extrato Sisbr..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <Separator />

              {/* Identificação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Palavras-chave no nome do arquivo para identificar este documento
                </label>
                <input
                  type="text"
                  value={formulario.identificacaoPalavras}
                  onChange={e => setFormulario(f => ({ ...f, identificacaoPalavras: e.target.value }))}
                  placeholder="Ex: FATURA (o arquivo contém esta palavra no título)"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">O sistema identifica o documento quando o nome do arquivo <strong>contém</strong> esta palavra (não precisa ser o título completo).</p>
              </div>

              {/* Contrato no nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  O número do contrato aparece no nome do arquivo?
                </label>
                <Select
                  value={formulario.contratoNoNome}
                  onValueChange={v => setFormulario(f => ({ ...f, contratoNoNome: v as "sim" | "nao" | "" }))}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim — ex: "FATURA - 330525.pdf" → contrato 330525</SelectItem>
                    <SelectItem value="nao">Não — o contrato está dentro do documento ou não se aplica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Campos de extração */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Dados a extrair do documento</label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setFormulario(f => ({
                      ...f,
                      camposExtracao: [...f.camposExtracao, { campo: "dadoPlanilha02", descricao: "", localizacao: "", dica: "" }]
                    }))}
                  >
                    + Adicionar campo
                  </Button>
                </div>
                <div className="space-y-3">
                  {formulario.camposExtracao.map((campo, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Select
                          value={campo.campo}
                          onValueChange={v => setFormulario(f => {
                            const updated = [...f.camposExtracao];
                            updated[idx] = { ...updated[idx], campo: v as CampoExtracao["campo"] };
                            return { ...f, camposExtracao: updated };
                          })}
                        >
                          <SelectTrigger className="w-44 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dadoPlanilha01">Dado Planilha 01</SelectItem>
                            <SelectItem value="dadoPlanilha02">Dado Planilha 02</SelectItem>
                            <SelectItem value="dadoPlanilha03">Dado Planilha 03</SelectItem>
                            <SelectItem value="dadoPlanilha04">Dado Planilha 04</SelectItem>
                            <SelectItem value="moraEspecifica">Mora Específica</SelectItem>
                          </SelectContent>
                        </Select>
                        {formulario.camposExtracao.length > 1 && (
                          <button
                            onClick={() => setFormulario(f => ({ ...f, camposExtracao: f.camposExtracao.filter((_, i) => i !== idx) }))}
                            className="text-red-400 hover:text-red-600 ml-auto"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={campo.descricao}
                        onChange={e => setFormulario(f => {
                          const updated = [...f.camposExtracao];
                          updated[idx] = { ...updated[idx], descricao: e.target.value };
                          return { ...f, camposExtracao: updated };
                        })}
                        placeholder="O que é este dado? Ex: número da conta cartão"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={campo.localizacao}
                        onChange={e => setFormulario(f => {
                          const updated = [...f.camposExtracao];
                          updated[idx] = { ...updated[idx], localizacao: e.target.value };
                          return { ...f, camposExtracao: updated };
                        })}
                        placeholder="Onde aparece? Ex: corpo do documento, cabeçalho, nome do arquivo após o hífen"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={campo.dica}
                        onChange={e => setFormulario(f => {
                          const updated = [...f.camposExtracao];
                          updated[idx] = { ...updated[idx], dica: e.target.value };
                          return { ...f, camposExtracao: updated };
                        })}
                        placeholder="Dica para encontrar (opcional): Ex: 13 dígitos, começa com 75644"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Multa e mora */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multa 2%</label>
                  <Select
                    value={formulario.multa2pct}
                    onValueChange={v => setFormulario(f => ({ ...f, multa2pct: v as FormularioConfig["multa2pct"] }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sempre SIM para este documento</SelectItem>
                      <SelectItem value="nao">Sempre NÃO para este documento</SelectItem>
                      <SelectItem value="extrair">Extrair do conteúdo do documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mora Específica</label>
                  <Select
                    value={formulario.moraFonte}
                    onValueChange={v => setFormulario(f => ({ ...f, moraFonte: v as FormularioConfig["moraFonte"] }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="extrair">Extrair deste documento</SelectItem>
                      <SelectItem value="outro">Extrair de outro documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setMostrarFormulario(false)}>
                  Pular e usar chat livre
                </Button>
                <Button
                  size="sm"
                  onClick={enviarFormulario}
                  disabled={!nomeDocumento.trim() || !formulario.identificacaoPalavras.trim()}
                  className="gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Gerar configuração com IA
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Botão para reabrir formulário guiado */}
        {isNew && !mostrarFormulario && messages.length <= 1 && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="text-xs text-blue-600 hover:underline text-left"
          >
            ← Voltar ao formulário guiado
          </button>
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
