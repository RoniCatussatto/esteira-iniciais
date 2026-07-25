import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, FileSpreadsheet, ChevronDown, ChevronRight,
  FileText, FileImage, CheckCircle, Clock, Save, Loader2,
  User, Car, FileCheck, Plus, Trash2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Devedor = {
  id: number; loteId: number;
  contrarioNome: string | null; contrarioCpf: string | null;
  contratos: string | null; valorBordero: string | null;
  vencBordero: string | null; contrarioEndereco: string | null;
  foro: string | null; cooperativa: string | null; dataBordero: string | null;
  veiculoModelo: string | null; veiculoAno: string | null;
  veiculoPlaca: string | null; veiculoRenavam: string | null; veiculoChassis: string | null;
  status: string;
};

type Extracao = {
  id: number; devedorId: number; loteId: number;
  numeroContrato: string;
  dadoPlanilha01: string | null; dadoPlanilha02: string | null;
  dadoPlanilha03: string | null; dadoPlanilha04: string | null;
  multa2pct: "sim" | "nao" | "branco" | null;
  moraEspecifica: string | null;
};

type Documento = {
  id: number; nomeArquivo: string; fileUrl: string;
  mimeType: string | null; tamanho: number | null;
};

function fileIcon(mimeType: string | null, nome: string) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.includes("pdf") || ext === "pdf") return <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  if (mimeType?.includes("image") || ["jpg","jpeg","png","gif","webp"].includes(ext))
    return <FileImage className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
  if (["doc","docx"].includes(ext)) return <FileText className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />;
  if (["xls","xlsx"].includes(ext)) return <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />;
}

// ── Card de uma extração (um contrato) ──────────────────────────────────────
function ExtracaoCard({
  ex, onSaved, onDeleted,
}: { ex: Extracao; onSaved: () => void; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    numeroContrato: ex.numeroContrato,
    dadoPlanilha01: ex.dadoPlanilha01 ?? "",
    dadoPlanilha02: ex.dadoPlanilha02 ?? "",
    dadoPlanilha03: ex.dadoPlanilha03 ?? "",
    dadoPlanilha04: ex.dadoPlanilha04 ?? "",
    multa2pct: (ex.multa2pct ?? "branco") as "sim" | "nao" | "branco",
    moraEspecifica: ex.moraEspecifica ?? "",
  });

  const updateMut = trpc.extracoes.update.useMutation({
    onSuccess: () => { toast.success("Contrato salvo."); onSaved(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMut = trpc.extracoes.delete.useMutation({
    onSuccess: () => { toast.success("Contrato removido."); onDeleted(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  async function handleSave() {
    setSaving(true);
    await updateMut.mutateAsync({
      id: ex.id,
      numeroContrato: fields.numeroContrato || ex.numeroContrato,
      dadoPlanilha01: fields.dadoPlanilha01 || null,
      dadoPlanilha02: fields.dadoPlanilha02 || null,
      dadoPlanilha03: fields.dadoPlanilha03 || null,
      dadoPlanilha04: fields.dadoPlanilha04 || null,
      multa2pct: fields.multa2pct,
      moraEspecifica: fields.moraEspecifica || null,
    });
    setSaving(false);
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-4">
      {/* Cabeçalho do contrato */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contrato</span>
          <Input
            value={fields.numeroContrato}
            onChange={(e) => setFields(f => ({ ...f, numeroContrato: e.target.value }))}
            className="h-7 text-sm font-mono w-40"
          />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover contrato?</AlertDialogTitle>
              <AlertDialogDescription>
                O contrato <strong>{ex.numeroContrato}</strong> e todos os seus dados extraídos serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMut.mutate({ id: ex.id })} className="bg-red-600 hover:bg-red-700">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Campos de extração */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["dadoPlanilha01","dadoPlanilha02","dadoPlanilha03","dadoPlanilha04"] as const).map((k, i) => (
          <div key={k} className="space-y-1">
            <Label className="text-xs text-gray-500">Dado Planilha 0{i+1}</Label>
            <Input
              value={fields[k]}
              onChange={(e) => setFields(f => ({ ...f, [k]: e.target.value }))}
              placeholder="—"
              className="h-8 text-sm"
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Multa 2%</Label>
          <Select value={fields.multa2pct} onValueChange={(v) => setFields(f => ({ ...f, multa2pct: v as "sim"|"nao"|"branco" }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="branco">— (em branco)</SelectItem>
              <SelectItem value="sim">Sim</SelectItem>
              <SelectItem value="nao">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Mora Específica</Label>
          <Input
            value={fields.moraEspecifica}
            onChange={(e) => setFields(f => ({ ...f, moraEspecifica: e.target.value }))}
            placeholder="Preencher apenas quando aplicável"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-8">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ── Card do devedor ──────────────────────────────────────────────────────────
function DevedorCard({
  dev, docs, extracoes, onChanged,
}: { dev: Devedor; docs: Documento[]; extracoes: Extracao[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [addingContrato, setAddingContrato] = useState(false);
  const [novoContrato, setNovoContrato] = useState("");

  const createMut = trpc.extracoes.create.useMutation({
    onSuccess: () => { toast.success("Contrato adicionado."); setNovoContrato(""); setAddingContrato(false); onChanged(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const initMut = trpc.extracoes.init.useMutation({
    onSuccess: () => { onChanged(); },
    onError: (e) => toast.error("Erro ao inicializar contratos: " + e.message),
  });

  function handleExpand() {
    if (!expanded && extracoes.length === 0 && dev.contratos) {
      // Inicializa automaticamente os contratos ao expandir pela primeira vez
      initMut.mutate({ devedorId: dev.id, loteId: dev.loteId, contratos: dev.contratos });
    }
    setExpanded(v => !v);
  }

  const temDados = extracoes.some(e =>
    e.dadoPlanilha01 || e.dadoPlanilha02 || e.dadoPlanilha03 || e.dadoPlanilha04 || e.moraEspecifica || (e.multa2pct && e.multa2pct !== "branco")
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Linha do devedor */}
      <div
        role="button" tabIndex={0}
        className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={handleExpand}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleExpand()}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{dev.contrarioNome ?? "—"}</span>
            <span className="text-sm text-gray-400">CPF: {dev.contrarioCpf ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {docs.length > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {docs.length} doc(s)
              </span>
            )}
            {extracoes.length > 0 && (
              <span className="text-xs text-gray-500">{extracoes.length} contrato(s)</span>
            )}
            {temDados ? (
              <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-300">
                <CheckCircle className="w-3 h-3" /> Dados preenchidos
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 text-gray-400">
                <Clock className="w-3 h-3" /> Pendente
              </Badge>
            )}
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">

          {/* Dados da Planilha BD */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Dados da Planilha BD
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div><span className="text-gray-500">Cooperativa:</span> <span className="font-medium">{dev.cooperativa ?? "—"}</span></div>
              <div><span className="text-gray-500">Data Borderô:</span> <span className="font-medium">{dev.dataBordero ?? "—"}</span></div>
              <div><span className="text-gray-500">Contratos:</span> <span className="font-medium">{dev.contratos ?? "—"}</span></div>
              <div><span className="text-gray-500">Valor Borderô:</span> <span className="font-medium">{dev.valorBordero ?? "—"}</span></div>
              <div><span className="text-gray-500">Vencimento:</span> <span className="font-medium">{dev.vencBordero ?? "—"}</span></div>
              <div><span className="text-gray-500">Foro:</span> <span className="font-medium">{dev.foro ?? "—"}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Endereço:</span> <span className="font-medium">{dev.contrarioEndereco ?? "—"}</span></div>
            </div>
          </div>

          {/* Veículo */}
          {(dev.veiculoModelo || dev.veiculoPlaca) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" /> Veículo
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div><span className="text-gray-500">Modelo:</span> <span className="font-medium">{dev.veiculoModelo ?? "—"}</span></div>
                <div><span className="text-gray-500">Ano:</span> <span className="font-medium">{dev.veiculoAno ?? "—"}</span></div>
                <div><span className="text-gray-500">Placa:</span> <span className="font-medium">{dev.veiculoPlaca ?? "—"}</span></div>
                <div><span className="text-gray-500">Renavam:</span> <span className="font-medium">{dev.veiculoRenavam ?? "—"}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Chassis:</span> <span className="font-medium">{dev.veiculoChassis ?? "—"}</span></div>
              </div>
            </div>
          )}

          {/* Documentos */}
          {docs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5" /> Documentos ({docs.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {docs.map((doc) => (
                  <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    {fileIcon(doc.mimeType, doc.nomeArquivo)}
                    <span className="truncate max-w-[180px]">{doc.nomeArquivo}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Extrações por contrato */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                Dados Extraídos dos Documentos — por Contrato
              </h4>
              <Button
                variant="outline" size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setAddingContrato(v => !v)}
              >
                <Plus className="w-3 h-3" /> Adicionar contrato
              </Button>
            </div>

            {/* Formulário para novo contrato */}
            {addingContrato && (
              <div className="mb-3 flex items-center gap-2 p-3 bg-white border border-blue-200 rounded-lg">
                <Input
                  value={novoContrato}
                  onChange={(e) => setNovoContrato(e.target.value)}
                  placeholder="Número do contrato"
                  className="h-8 text-sm flex-1"
                  onKeyDown={(e) => e.key === "Enter" && novoContrato.trim() && createMut.mutate({ devedorId: dev.id, loteId: dev.loteId, numeroContrato: novoContrato.trim() })}
                />
                <Button size="sm" className="h-8"
                  disabled={!novoContrato.trim() || createMut.isPending}
                  onClick={() => novoContrato.trim() && createMut.mutate({ devedorId: dev.id, loteId: dev.loteId, numeroContrato: novoContrato.trim() })}>
                  {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Adicionar"}
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setAddingContrato(false)}>Cancelar</Button>
              </div>
            )}

            {/* Cards de cada contrato */}
            {initMut.isPending ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Inicializando contratos...
              </div>
            ) : extracoes.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                {dev.contratos ? "Nenhum contrato inicializado ainda." : "Sem contratos cadastrados."}
              </p>
            ) : (
              <div className="space-y-3">
                {extracoes.map((ex) => (
                  <ExtracaoCard key={ex.id} ex={ex} onSaved={onChanged} onDeleted={onChanged} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function RevisaoPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const loteId = parseInt(params.id ?? "0");

  const { data: lote, isLoading: loadingLote } = trpc.lotes.getById.useQuery({ id: loteId });
  const { data: devedores, isLoading: loadingDevedores } = trpc.lotes.getDevedores.useQuery({ loteId });
  const { data: documentos } = trpc.documentos.getByLote.useQuery({ loteId });
  const { data: todasExtracoes, refetch: refetchExtracoes } = trpc.extracoes.getByLote.useQuery({ loteId });

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

  // Agrupa documentos e extrações por devedorId
  const docsPorDevedor = (documentos ?? []).reduce<Record<number, Documento[]>>((acc, doc) => {
    if (!acc[doc.devedorId]) acc[doc.devedorId] = [];
    acc[doc.devedorId].push(doc as Documento);
    return acc;
  }, {});

  const extracoesPorDevedor = (todasExtracoes ?? []).reduce<Record<number, Extracao[]>>((acc, ex) => {
    if (!acc[ex.devedorId]) acc[ex.devedorId] = [];
    acc[ex.devedorId].push(ex as Extracao);
    return acc;
  }, {});

  const totalDevedores = devedores?.length ?? 0;
  const totalComDados = (devedores ?? []).filter(d => {
    const exs = extracoesPorDevedor[d.id] ?? [];
    return exs.some(e => e.dadoPlanilha01 || e.dadoPlanilha02 || e.dadoPlanilha03 || e.dadoPlanilha04 || e.moraEspecifica || (e.multa2pct && e.multa2pct !== "branco"));
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/lote/${loteId}/documentos`)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar aos Documentos
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{lote.nome}</h1>
            <p className="text-sm text-gray-500">
              Etapa 3 — Revisão e Extração de Dados · {totalComDados}/{totalDevedores} devedor(es) com dados preenchidos
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revisão Completa do Lote</CardTitle>
            <CardDescription>
              Confira os dados de cada devedor, visualize os documentos e preencha os campos extraídos por contrato.
              Ao expandir um devedor, os contratos são inicializados automaticamente a partir dos dados da planilha BD.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-600">{totalDevedores} devedor(es) no lote</span>
              <span className="flex items-center gap-1.5 text-green-700">
                <CheckCircle className="w-4 h-4" /> {totalComDados} com dados preenchidos
              </span>
              {totalDevedores - totalComDados > 0 && (
                <span className="flex items-center gap-1.5 text-amber-600">
                  <Clock className="w-4 h-4" /> {totalDevedores - totalComDados} pendente(s)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {(devedores ?? []).map((dev) => (
            <DevedorCard
              key={dev.id}
              dev={dev as Devedor}
              docs={docsPorDevedor[dev.id] ?? []}
              extracoes={extracoesPorDevedor[dev.id] ?? []}
              onChanged={() => refetchExtracoes()}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
