import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileSpreadsheet, Trash2, Loader2,
  Calculator, ChevronDown, ChevronRight,
} from "lucide-react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIAS = [
  "Geral IPCA",
  "Geral SELIC",
  "CAC e CCB",
  "CE",
  "Cartao",
  "Confissao",
  "Santa Casa",
  "Colegio",
  "Cheque",
  "CE e Cartao",
  "Emprestimo com CE",
  "Emprestimo com Cartao",
  "Emprestimo com CE e Cartao",
] as const;

type ModeloCalculo = {
  id: number;
  categoriaPlanilha: string;
  qtdContratos: number;
  fileKey: string;
  fileUrl: string;
  nomeArquivo: string;
  tamanho: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Linha de modelo na tabela ────────────────────────────────────────────────
function ModeloRow({
  modelo,
  onDeleted,
}: {
  modelo: ModeloCalculo;
  onDeleted: (id: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMut = trpc.modelosCalculo.delete.useMutation({
    onSuccess: () => {
      toast.success(`Planilha de ${modelo.qtdContratos} contrato(s) excluída.`);
      onDeleted(modelo.id);
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  return (
    <>
      <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2.5 text-center">
          <Badge variant="outline" className="font-mono text-xs px-2">
            {modelo.qtdContratos}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">
          <a
            href={modelo.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-blue-600 transition-colors max-w-xs truncate"
            title={modelo.nomeArquivo}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-green-600" />
            <span className="truncate">{modelo.nomeArquivo}</span>
          </a>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-400 text-right">
          {formatBytes(modelo.tamanho)}
        </td>
        <td className="px-4 py-2.5 text-right">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </td>
      </tr>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              A planilha de <strong>{modelo.qtdContratos} contrato(s)</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteMut.mutate({ id: modelo.id })}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Bloco de categoria (accordion) ──────────────────────────────────────────
function CategoriaBlock({
  categoria,
  modelos,
  onDeleted,
}: {
  categoria: string;
  modelos: ModeloCalculo[];
  onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const sorted = [...modelos].sort((a, b) => a.qtdContratos - b.qtdContratos);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-sm text-gray-800">{categoria}</span>
          <Badge variant="secondary" className="text-xs font-normal">
            {modelos.length} planilha{modelos.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-white">
              <th className="text-center px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide w-24">Contratos</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Arquivo</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide w-24">Tamanho</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide w-16">Ação</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <ModeloRow key={m.id} modelo={m} onDeleted={onDeleted} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Formulário de upload ─────────────────────────────────────────────────────
// ── Parsing do nome do arquivo ───────────────────────────────────────────────
// Formato esperado: "<Categoria> <N>" onde N é um número inteiro (ex: "Geral IPCA 3")
function parseNomeArquivo(nome: string): { categoria: string; qtd: number } | null {
  const semExt = nome.replace(/\.xlsx$/i, "").trim();
  // Extrai o número no final
  const match = semExt.match(/^(.+?)\s+(\d+)$/);
  if (!match) return null;
  const categoriaCandidata = match[1].trim();
  const qtd = parseInt(match[2], 10);
  if (isNaN(qtd) || qtd < 1 || qtd > 20) return null;
  // Verifica se a categoria é válida (case-insensitive)
  const found = CATEGORIAS.find(
    (c) => c.toLowerCase() === categoriaCandidata.toLowerCase()
  );
  if (!found) return null;
  return { categoria: found, qtd };
}

type FileItem = {
  file: File;
  parsed: { categoria: string; qtd: number } | null;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = trpc.modelosCalculo.upload.useMutation();

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const novos: FileItem[] = arr
      .filter((f) => f.name.toLowerCase().endsWith(".xlsx"))
      .map((f) => ({
        file: f,
        parsed: parseNomeArquivo(f.name),
        status: "pending" as const,
      }));
    const ignorados = arr.length - novos.length;
    if (ignorados > 0) toast.warning(`${ignorados} arquivo(s) ignorado(s) — apenas .xlsx é aceito.`);
    setItems((prev) => {
      // Evita duplicatas pelo nome
      const existentes = new Set(prev.map((i) => i.file.name));
      return [...prev, ...novos.filter((n) => !existentes.has(n.file.name))];
    });
  }, []);

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const validos = items.filter((i) => i.parsed && i.status === "pending");
    if (validos.length === 0) return;
    setUploading(true);
    let sucesso = 0;
    let falha = 0;
    for (const item of validos) {
      setItems((prev) =>
        prev.map((i) => i.file.name === item.file.name ? { ...i, status: "uploading" } : i)
      );
      try {
        const base64 = await fileToBase64(item.file);
        await uploadMut.mutateAsync({
          categoriaPlanilha: item.parsed!.categoria,
          qtdContratos: item.parsed!.qtd,
          nomeArquivo: item.file.name,
          tamanho: item.file.size,
          fileBase64: base64,
        });
        setItems((prev) =>
          prev.map((i) => i.file.name === item.file.name ? { ...i, status: "done" } : i)
        );
        sucesso++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        setItems((prev) =>
          prev.map((i) => i.file.name === item.file.name ? { ...i, status: "error", error: msg } : i)
        );
        falha++;
      }
    }
    setUploading(false);
    if (sucesso > 0) {
      toast.success(`${sucesso} planilha(s) enviada(s) com sucesso.`);
      onUploaded();
    }
    if (falha > 0) toast.error(`${falha} planilha(s) falharam.`);
    // Remove as concluídas após 2s
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.status !== "done"));
    }, 2000);
  };

  const validosPendentes = items.filter((i) => i.parsed && i.status === "pending");
  const invalidos = items.filter((i) => !i.parsed && i.status === "pending");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Upload className="w-4 h-4 text-green-600" />
        Adicionar / Substituir Planilhas de Cálculo
      </h2>
      <p className="text-xs text-gray-500">
        Arraste uma ou várias planilhas de uma vez. O nome do arquivo deve seguir o padrão{" "}
        <code className="bg-gray-100 px-1 rounded font-mono">Categoria N.xlsx</code>{" "}
        — ex: <code className="bg-gray-100 px-1 rounded font-mono">Geral IPCA 3.xlsx</code>,{" "}
        <code className="bg-gray-100 px-1 rounded font-mono">Emprestimo com CE e Cartao 8.xlsx</code>.
        Se já existir para a mesma combinação, o arquivo será substituído.
      </p>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
        />
        <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">
          Clique ou arraste <strong>uma ou várias planilhas .xlsx</strong> aqui
        </p>
      </div>

      {/* Lista de arquivos */}
      {items.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={item.file.name}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                item.status === "done" ? "bg-green-50 border-green-200" :
                item.status === "error" ? "bg-red-50 border-red-200" :
                item.status === "uploading" ? "bg-blue-50 border-blue-200" :
                !item.parsed ? "bg-amber-50 border-amber-200" :
                "bg-gray-50 border-gray-200"
              }`}
            >
              {item.status === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : item.status === "error" ? (
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              ) : item.status === "uploading" ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              ) : !item.parsed ? (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{item.file.name}</span>
                {item.parsed ? (
                  <span className="text-xs text-gray-500">
                    {item.parsed.categoria} · {item.parsed.qtd} contrato{item.parsed.qtd !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600">
                    Nome não reconhecido — verifique o padrão "Categoria N"
                  </span>
                )}
                {item.error && <span className="text-xs text-red-500 block">{item.error}</span>}
              </div>
              <span className="text-xs text-gray-400 shrink-0">{formatBytes(item.file.size)}</span>
              {item.status === "pending" && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {invalidos.length > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {invalidos.length} arquivo(s) com nome não reconhecido serão ignorados no envio.
        </p>
      )}

      <div className="flex gap-2">
        {items.length > 0 && !uploading && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItems([])}
            className="text-gray-500"
          >
            Limpar lista
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={validosPendentes.length === 0 || uploading}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" />
              Enviar {validosPendentes.length > 0 ? `${validosPendentes.length} planilha${validosPendentes.length !== 1 ? "s" : ""}` : "Planilhas"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function ModelosCalculoPage() {
  const [, navigate] = useLocation();
  const { data: modelosRaw, refetch } = trpc.modelosCalculo.list.useQuery();
  const [modelos, setModelos] = useState<ModeloCalculo[] | null>(null);

  const modelosFinal: ModeloCalculo[] = modelos ?? ((modelosRaw as ModeloCalculo[] | undefined) ?? []);

  // Agrupa por categoria
  const porCategoria = modelosFinal.reduce<Record<string, ModeloCalculo[]>>((acc, m) => {
    if (!acc[m.categoriaPlanilha]) acc[m.categoriaPlanilha] = [];
    acc[m.categoriaPlanilha].push(m);
    return acc;
  }, {});

  // Ordena as categorias pela ordem definida
  const categoriasComDados = CATEGORIAS.filter((c) => porCategoria[c]);
  const totalPlanilhas = modelosFinal.length;
  const totalCategorias = categoriasComDados.length;

  const handleDeleted = (id: number) => {
    setModelos((prev) => (prev ?? modelosFinal).filter((m) => m.id !== id));
  };

  const handleUploaded = () => {
    setModelos(null);
    refetch();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Início
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-green-600" />
            <div>
              <h1 className="text-base font-semibold text-gray-900">Modelos de Cálculos</h1>
              <p className="text-xs text-gray-500">
                {totalPlanilhas} planilha{totalPlanilhas !== 1 ? "s" : ""} em {totalCategorias} categoria{totalCategorias !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Formulário de upload */}
        <UploadForm onUploaded={handleUploaded} />

        {/* Listagem por categoria */}
        {totalPlanilhas === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl py-14 text-center text-gray-400">
            <Calculator className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">Nenhuma planilha cadastrada ainda. Faça o upload da primeira planilha acima.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 px-1">Planilhas por Categoria</h2>
            {categoriasComDados.map((cat) => (
              <CategoriaBlock
                key={cat}
                categoria={cat}
                modelos={porCategoria[cat]}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

