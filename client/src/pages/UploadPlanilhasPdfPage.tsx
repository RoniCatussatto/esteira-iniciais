import { useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  X,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

interface ResultadoExtracao {
  nomeArquivo: string;
  devedorId: number | null;
  valorExtraido: string | null;
  sucesso: boolean;
}

interface ValorEditavel {
  devedorId: number;
  nomeArquivo: string;
  valorCausa: string;
  foiExtraido: boolean;
}

export default function UploadPlanilhasPdfPage() {
  const { id } = useParams<{ id: string }>();
  const loteId = parseInt(id ?? "0");
  const [, navigate] = useLocation();

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultados, setResultados] = useState<ValorEditavel[]>([]);
  const [falhas, setFalhas] = useState<ResultadoExtracao[]>([]);
  const [salvo, setSalvo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: lote } = trpc.lotes.getById.useQuery({ id: loteId }, { enabled: !!loteId });

  const adicionarArquivos = useCallback((novos: File[]) => {
    const pdfs = novos.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length < novos.length) {
      toast.warning("Apenas arquivos PDF são aceitos. Outros arquivos foram ignorados.");
    }
    setArquivos((prev) => {
      const existentes = new Set(prev.map((f) => f.name));
      const unicos = pdfs.filter((f) => !existentes.has(f.name));
      return [...prev, ...unicos];
    });
    setSalvo(false);
    setResultados([]);
    setFalhas([]);
  }, []);

  const removerArquivo = (nome: string) => {
    setArquivos((prev) => prev.filter((f) => f.name !== nome));
    setResultados((prev) => prev.filter((r) => r.nomeArquivo !== nome));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setArrastando(false);
      adicionarArquivos(Array.from(e.dataTransfer.files));
    },
    [adicionarArquivos]
  );

  const handleExtrair = async () => {
    if (arquivos.length === 0) return;
    setExtraindo(true);
    setResultados([]);
    setFalhas([]);
    setSalvo(false);

    try {
      const formData = new FormData();
      arquivos.forEach((f) => formData.append("pdfs", f));

      const resp = await fetch(`/api/upload-planilhas-pdf/${loteId}/extrair`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? `Erro ${resp.status}`);
      }

      const data = await resp.json() as { resultados: ResultadoExtracao[] };

      const ok: ValorEditavel[] = [];
      const nok: ResultadoExtracao[] = [];

      for (const r of data.resultados) {
        if (r.devedorId && r.valorExtraido) {
          ok.push({
            devedorId: r.devedorId,
            nomeArquivo: r.nomeArquivo,
            valorCausa: r.valorExtraido,
            foiExtraido: true,
          });
        } else {
          nok.push(r);
        }
      }

      setResultados(ok);
      setFalhas(nok);

      if (ok.length > 0) {
        toast.success(`${ok.length} planilha(s) processada(s) com sucesso.`);
      }
      if (nok.length > 0) {
        toast.warning(`${nok.length} arquivo(s) não puderam ser processados.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao extrair PDFs";
      toast.error(msg);
    } finally {
      setExtraindo(false);
    }
  };

  const handleSalvar = async () => {
    const validos = resultados.filter((r) => r.valorCausa.trim() !== "");
    if (validos.length === 0) {
      toast.warning("Nenhum valor para salvar.");
      return;
    }
    setSalvando(true);
    try {
      const resp = await fetch(`/api/upload-planilhas-pdf/${loteId}/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valores: validos.map((r) => ({
            devedorId: r.devedorId,
            valorCausa: r.valorCausa,
          })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? `Erro ${resp.status}`);
      }

      setSalvo(true);
      toast.success(`${validos.length} valor(es) da causa salvos com sucesso!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const atualizarValor = (devedorId: number, novoValor: string) => {
    setResultados((prev) =>
      prev.map((r) => (r.devedorId === devedorId ? { ...r, valorCausa: novoValor } : r))
    );
    setSalvo(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/lote/${loteId}/gerar-planilhas`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex-1 flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Upload das Planilhas em PDF</h1>
            {lote && (
              <p className="text-sm text-gray-500">{lote.cooperativa} — {lote.nome}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Instruções */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800">Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-2">
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Após revisar as planilhas no Excel, salve cada uma como <strong>PDF</strong></li>
              <li>Faça o upload de todos os PDFs aqui (pode selecionar vários de uma vez)</li>
              <li>O sistema extrai automaticamente o <strong>Total Geral</strong> de cada planilha</li>
              <li>Revise e corrija os valores se necessário, depois clique em <strong>Salvar</strong></li>
            </ol>
          </CardContent>
        </Card>

        {/* Área de upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800">Selecionar PDFs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                arrastando
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 font-medium">
                Arraste os PDFs aqui ou clique para selecionar
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Selecione múltiplos arquivos de uma vez
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => adicionarArquivos(Array.from(e.target.files ?? []))}
              />
            </div>

            {/* Lista de arquivos selecionados */}
            {arquivos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">{arquivos.length} arquivo(s) selecionado(s):</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {arquivos.map((f) => (
                    <div key={f.name} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                      <span className="text-gray-700 truncate flex-1">{f.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removerArquivo(f.name); }}
                        className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleExtrair}
                  disabled={extraindo}
                  className="w-full gap-2"
                >
                  {extraindo ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Extraindo valores...</>
                  ) : (
                    <><FileText className="w-4 h-4" /> Extrair Total Geral dos PDFs</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Falhas */}
        {falhas.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {falhas.length} arquivo(s) não processados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-amber-700 space-y-1">
                {falhas.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span>•</span>
                    <span>
                      <strong>{f.nomeArquivo}</strong>
                      {!f.devedorId && " — devedor não identificado"}
                      {f.devedorId && !f.valorExtraido && " — Total Geral não encontrado no PDF"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                Verifique se o arquivo foi salvo corretamente como PDF e se o nome corresponde ao devedor.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Resultados para revisão */}
        {resultados.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Revisar Valores da Causa
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Confira os valores extraídos e corrija se necessário antes de salvar.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {resultados.map((r) => (
                <div key={r.devedorId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {r.nomeArquivo.replace(/\.pdf$/i, "").replace(/^PLANILHA [^-]+ - /, "")}
                    </p>
                    {r.foiExtraido && (
                      <p className="text-xs text-green-600 mt-0.5">Extraído automaticamente</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-gray-500">R$</span>
                    <Input
                      value={r.valorCausa}
                      onChange={(e) => atualizarValor(r.devedorId, e.target.value)}
                      className="w-36 text-right font-mono text-sm"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSalvar}
                  disabled={salvando || salvo}
                  className="flex-1 gap-2"
                >
                  {salvando ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                  ) : salvo ? (
                    <><CheckCircle2 className="w-4 h-4 text-green-500" /> Salvo!</>
                  ) : (
                    <><Save className="w-4 h-4" /> Salvar Valores da Causa</>
                  )}
                </Button>
              </div>

              {salvo && (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Valores salvos com sucesso!
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => navigate(`/lote/${loteId}/gerar-peticoes`)}
                  >
                    Próximo passo
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
