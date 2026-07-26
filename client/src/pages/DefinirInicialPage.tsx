import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, ChevronDown, ChevronRight,
  FileText, FileImage, ExternalLink, Loader2,
  FileSpreadsheet, User, CheckCircle, Clock,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────
type Devedor = {
  id: number;
  loteId: number;
  contrarioNome: string | null;
  contrarioCpf: string | null;
  contratos: string | null;
  cooperativa: string | null;
  dataBordero: string | null;
  modeloInicial: string | null;
};

type Extracao = {
  id: number;
  devedorId: number;
  numeroContrato: string;
  dadoPlanilha01: string | null;
  dadoPlanilha02: string | null;
  dadoPlanilha03: string | null;
  dadoPlanilha04: string | null;
  multa2pct: "sim" | "nao" | "branco" | null;
  moraEspecifica: string | null;
  indiceCorrecao: "ipca" | "selic" | null;
};

type Documento = {
  id: number;
  nomeArquivo: string;
  fileUrl: string;
  mimeType: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fileIcon(mimeType: string | null, nome: string) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.includes("pdf") || ext === "pdf")
    return <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  if (mimeType?.includes("image") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
    return <FileImage className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />;
}

/** Detecta tipo de contrato para pré-preencher índice */
function detectarIndice(ex: Extracao): "ipca" | "selic" {
  // Cartão: tem moraEspecifica preenchida
  if (ex.moraEspecifica && ex.moraEspecifica.trim().length > 0) return "selic";
  // Cheque especial: dp01 vazio (sem número de contrato)
  if (!ex.dadoPlanilha01 || ex.dadoPlanilha01.trim().length === 0) return "selic";
  return "ipca";
}

// ── Card de um devedor ───────────────────────────────────────────────────────
function DevedorCard({
  dev,
  docs,
  extracoes,
  modeloPadraoCoop,
  onModeloSaved,
  onIndiceSaved,
}: {
  dev: Devedor;
  docs: Documento[];
  extracoes: Extracao[];
  modeloPadraoCoop: string | null;
  onModeloSaved: (devedorId: number, modelo: string | null) => void;
  onIndiceSaved: () => void;
}) {
  // Expandido por padrão quando modelo ainda não foi definido
  const [expanded, setExpanded] = useState(!dev.modeloInicial);
  const [modelo, setModelo] = useState(dev.modeloInicial ?? modeloPadraoCoop ?? "");
  const [savingModelo, setSavingModelo] = useState(false);

  const saveModeloMut = trpc.devedores.saveModeloInicial.useMutation({
    onSuccess: () => {
      toast.success("Modelo salvo.");
      onModeloSaved(dev.id, modelo || null);
      // Colapsa automaticamente após salvar com sucesso
      if (modelo && modelo.trim()) setExpanded(false);
    },
    onError: (e) => toast.error("Erro ao salvar modelo: " + e.message),
    onSettled: () => setSavingModelo(false),
  });

  const saveIndiceMut = trpc.extracoes.saveIndice.useMutation({
    onSuccess: () => {
      toast.success("Índice salvo.");
      onIndiceSaved();
    },
    onError: (e) => toast.error("Erro ao salvar índice: " + e.message),
  });

  const handleSaveModelo = () => {
    setSavingModelo(true);
    saveModeloMut.mutate({ id: dev.id, modeloInicial: modelo || null });
  };

  const modeloDefinido = !!(dev.modeloInicial ?? (modelo && modelo.trim()));

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Cabeçalho do card */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-gray-900">
            {dev.contrarioNome ?? "Devedor sem nome"}
          </span>
          {dev.contrarioCpf && (
            <span className="text-xs text-gray-400 ml-2">CPF: {dev.contrarioCpf}</span>
          )}
          {dev.contratos && (
            <span className="text-xs text-gray-400 ml-2">· {dev.contratos}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Badge do modelo */}
          {dev.modeloInicial ? (
            <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50">
              {dev.modeloInicial}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              Modelo pendente
            </Badge>
          )}
          {/* Documentos chips */}
          {docs.length > 0 && (
            <span className="text-xs text-gray-400">{docs.length} doc(s)</span>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-5">

          {/* Documentos disponíveis */}
          {docs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Documentos disponíveis
              </p>
              <div className="flex flex-wrap gap-2">
                {docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    {fileIcon(doc.mimeType, doc.nomeArquivo)}
                    <span className="truncate max-w-[200px]">{doc.nomeArquivo}</span>
                    <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Campo Modelo da Inicial */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Modelo da Petição Inicial
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder={modeloPadraoCoop ? `Padrão: ${modeloPadraoCoop}` : "Ex: CAC, COB CCB, EXEC CONFISSAO"}
                className="h-8 text-sm max-w-xs bg-white"
                onKeyDown={(e) => e.key === "Enter" && handleSaveModelo()}
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={savingModelo || saveModeloMut.isPending}
                onClick={handleSaveModelo}
              >
                {savingModelo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
              </Button>
              {modeloPadraoCoop && !dev.modeloInicial && (
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setModelo(modeloPadraoCoop)}
                >
                  Usar padrão da cliente
                </button>
              )}
            </div>
          </div>

          {/* Tabela de contratos */}
          {extracoes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Contratos — Índice de Correção
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Dado 01</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Dado 02</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Dado 03</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Dado 04</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-500">Multa</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-500">Índice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracoes.map((ex) => {
                      const indiceAtual = ex.indiceCorrecao ?? detectarIndice(ex);
                      return (
                        <tr key={ex.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate" title={ex.dadoPlanilha01 ?? ""}>
                            {ex.dadoPlanilha01 ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate" title={ex.dadoPlanilha02 ?? ""}>
                            {ex.dadoPlanilha02 ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate" title={ex.dadoPlanilha03 ?? ""}>
                            {ex.dadoPlanilha03 ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate" title={ex.dadoPlanilha04 ?? ""}>
                            {ex.dadoPlanilha04 ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ex.multa2pct === "sim" ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">2%</span>
                            ) : (
                              <span className="text-gray-300">0%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                              <button
                                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                                  indiceAtual === "ipca"
                                    ? "bg-blue-600 text-white"
                                    : "bg-white text-gray-500 hover:bg-gray-50"
                                }`}
                                onClick={() =>
                                  indiceAtual !== "ipca" &&
                                  saveIndiceMut.mutate({ id: ex.id, indiceCorrecao: "ipca" })
                                }
                              >
                                IPCA
                              </button>
                              <button
                                className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-200 ${
                                  indiceAtual === "selic"
                                    ? "bg-green-600 text-white"
                                    : "bg-white text-gray-500 hover:bg-gray-50"
                                }`}
                                onClick={() =>
                                  indiceAtual !== "selic" &&
                                  saveIndiceMut.mutate({ id: ex.id, indiceCorrecao: "selic" })
                                }
                              >
                                Selic
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {extracoes.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              Nenhum contrato extraído para este devedor. Volte à etapa de revisão para extrair os dados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function DefinirInicialPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const loteId = parseInt(params.id ?? "0");

  const { data: lote, isLoading: loadingLote } = trpc.lotes.getById.useQuery({ id: loteId });
  const { data: devedoresRaw, isLoading: loadingDevedores, refetch: refetchDevedores } =
    trpc.lotes.getDevedores.useQuery({ loteId });
  const { data: documentos } = trpc.documentos.getByLote.useQuery({ loteId });
  const { data: todasExtracoes, refetch: refetchExtracoes } =
    trpc.extracoes.getByLote.useQuery({ loteId });
  // Busca o modeloPadrao da cooperativa do lote via matching fuzzy no backend
  const { data: modeloPadraoLote } = trpc.lotes.getModeloPadrao.useQuery(
    { cooperativa: lote?.cooperativa ?? "" },
    { enabled: !!lote?.cooperativa },
  );

  // Estado local dos devedores para atualizar modeloInicial sem refetch completo
  const [devedores, setDevedores] = useState<Devedor[] | null>(null);

  // Sincroniza com dados do servidor quando carregados
  const devedoresFinal: Devedor[] = devedores ?? ((devedoresRaw as Devedor[] | undefined) ?? []);

  const handleModeloSaved = useCallback((devedorId: number, modelo: string | null) => {
    setDevedores((prev) => {
      const base = prev ?? ((devedoresRaw as Devedor[] | undefined) ?? []);
      return base.map((d) => d.id === devedorId ? { ...d, modeloInicial: modelo } : d);
    });
  }, [devedoresRaw]);

  if (loadingLote || loadingDevedores) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!lote) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Lote não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>
    );
  }

  // Agrupamentos
  const docsPorDevedor = (documentos ?? []).reduce<Record<number, Documento[]>>((acc, doc) => {
    if (!acc[(doc as Documento & { devedorId: number }).devedorId])
      acc[(doc as Documento & { devedorId: number }).devedorId] = [];
    acc[(doc as Documento & { devedorId: number }).devedorId].push(doc as Documento);
    return acc;
  }, {});

  const extracoesPorDevedor = (todasExtracoes ?? []).reduce<Record<number, Extracao[]>>((acc, ex) => {
    if (!acc[ex.devedorId]) acc[ex.devedorId] = [];
    acc[ex.devedorId].push(ex as Extracao);
    return acc;
  }, {});

  // Busca modeloPadrao da cooperativa de cada devedor
  const totalDevedores = devedoresFinal.length;
  const totalComModelo = devedoresFinal.filter((d) => d.modeloInicial).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/lote/${loteId}/revisao`)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar à Revisão
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{lote.nome}</h1>
            <p className="text-sm text-gray-500">
              Etapa 4 — Definir Inicial · {totalComModelo}/{totalDevedores} devedor(es) com modelo definido
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2 ml-auto"
            onClick={() => toast.info("Próxima etapa em breve.")}
          >
            Avançar — Gerar Planilhas <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {/* Resumo */}
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center gap-6 text-sm">
          <span className="text-gray-600">{totalDevedores} devedor(es) no lote</span>
          <span className="flex items-center gap-1.5 text-green-700">
            <CheckCircle className="w-4 h-4" /> {totalComModelo} com modelo definido
          </span>
          {totalDevedores - totalComModelo > 0 && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <Clock className="w-4 h-4" /> {totalDevedores - totalComModelo} pendente(s)
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            Clique em um devedor para expandir e definir o modelo e o índice de cada contrato.
          </span>
        </div>

        {/* Lista de devedores */}
        <div className="space-y-3">
          {devedoresFinal.map((dev) => {
            return (
              <DevedorCard
                key={dev.id}
                dev={dev}
                docs={docsPorDevedor[dev.id] ?? []}
                extracoes={extracoesPorDevedor[dev.id] ?? []}
                modeloPadraoCoop={modeloPadraoLote ?? null}
                onModeloSaved={handleModeloSaved}
                onIndiceSaved={() => refetchExtracoes()}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
