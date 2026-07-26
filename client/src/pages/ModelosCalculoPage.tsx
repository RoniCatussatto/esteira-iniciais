import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileSpreadsheet, Trash2, Loader2,
  Calculator, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [categoria, setCategoria] = useState<string>("");
  const [qtdContratos, setQtdContratos] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = trpc.modelosCalculo.upload.useMutation({
    onSuccess: () => {
      toast.success(`Planilha de ${qtdContratos} contrato(s) para "${categoria}" salva com sucesso.`);
      setCategoria("");
      setQtdContratos("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    },
    onError: (e) => toast.error("Erro no upload: " + e.message),
    onSettled: () => setUploading(false),
  });

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Apenas arquivos .xlsx são aceitos.");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!categoria || !qtdContratos || !file) return;
    const qtd = parseInt(qtdContratos, 10);
    if (isNaN(qtd) || qtd < 1 || qtd > 20) {
      toast.error("Quantidade de contratos deve ser entre 1 e 20.");
      return;
    }
    setUploading(true);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    uploadMut.mutate({
      categoriaPlanilha: categoria,
      qtdContratos: qtd,
      nomeArquivo: file.name,
      tamanho: file.size,
      fileBase64: base64,
    });
  };

  const canSubmit = categoria.length > 0 && qtdContratos.length > 0 && file !== null && !uploading;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Upload className="w-4 h-4 text-green-600" />
        Adicionar / Substituir Planilha de Cálculo
      </h2>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm text-green-700">
            <FileSpreadsheet className="w-5 h-5" />
            <span className="font-medium">{file.name}</span>
            <span className="text-gray-400">({formatBytes(file.size)})</span>
          </div>
        ) : (
          <div className="text-gray-400 space-y-1">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Clique ou arraste o arquivo <strong>.xlsx</strong> aqui</p>
          </div>
        )}
      </div>

      {/* Categoria e quantidade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Categoria <span className="text-red-500">*</span></label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Nº de contratos <span className="text-red-500">*</span></label>
          <Select value={qtdContratos} onValueChange={setQtdContratos}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Quantidade" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>{n} contrato{n !== 1 ? "s" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">Se já existir para essa combinação, o arquivo será substituído.</p>
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full bg-green-600 hover:bg-green-700">
        {uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
        ) : (
          <><Upload className="w-4 h-4 mr-2" />Enviar Planilha</>
        )}
      </Button>
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
