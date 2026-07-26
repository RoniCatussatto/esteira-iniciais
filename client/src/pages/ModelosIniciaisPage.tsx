import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileText, Pencil, Trash2, Check, X,
  Loader2, BookOpen, ChevronDown,
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

type ModeloInicial = {
  id: number;
  nome: string;
  categoriaPlanilha: string;
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
  onUpdated,
}: {
  modelo: ModeloInicial;
  onDeleted: (id: number) => void;
  onUpdated: (id: number, nome: string, categoria: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editNome, setEditNome] = useState(modelo.nome);
  const [editCategoria, setEditCategoria] = useState(modelo.categoriaPlanilha);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMut = trpc.modelosIniciais.update.useMutation({
    onSuccess: () => {
      toast.success("Modelo atualizado.");
      onUpdated(modelo.id, editNome, editCategoria);
      setEditing(false);
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMut = trpc.modelosIniciais.delete.useMutation({
    onSuccess: () => {
      toast.success("Modelo excluído.");
      onDeleted(modelo.id);
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  return (
    <>
      <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
        {/* Nome */}
        <td className="px-4 py-3">
          {editing ? (
            <Input
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              className="h-8 text-sm w-48"
              placeholder="Nome do modelo"
            />
          ) : (
            <span className="font-medium text-gray-900">{modelo.nome}</span>
          )}
        </td>
        {/* Categoria */}
        <td className="px-4 py-3">
          {editing ? (
            <Select value={editCategoria} onValueChange={setEditCategoria}>
              <SelectTrigger className="h-8 text-sm w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary" className="text-xs font-normal">
              {modelo.categoriaPlanilha}
            </Badge>
          )}
        </td>
        {/* Arquivo */}
        <td className="px-4 py-3 text-sm text-gray-500">
          <a
            href={modelo.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-blue-600 transition-colors max-w-[220px] truncate"
            title={modelo.nomeArquivo}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{modelo.nomeArquivo}</span>
          </a>
        </td>
        {/* Tamanho */}
        <td className="px-4 py-3 text-sm text-gray-400 text-right">
          {formatBytes(modelo.tamanho)}
        </td>
        {/* Ações */}
        <td className="px-4 py-3 text-right">
          {editing ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                disabled={updateMut.isPending || !editNome.trim()}
                onClick={() => updateMut.mutate({ id: modelo.id, nome: editNome.trim(), categoriaPlanilha: editCategoria })}
              >
                {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => { setEditing(false); setEditNome(modelo.nome); setEditCategoria(modelo.categoriaPlanilha); }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
        </td>
      </tr>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo <strong>{modelo.nome}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
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

// ── Formulário de upload ─────────────────────────────────────────────────────
function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = trpc.modelosIniciais.upload.useMutation({
    onSuccess: (result) => {
      const msg = result.replaced
        ? `Modelo "${nome}" substituído com sucesso.`
        : `Modelo "${nome}" adicionado com sucesso.`;
      toast.success(msg);
      setNome("");
      setCategoria("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    },
    onError: (e) => toast.error("Erro no upload: " + e.message),
    onSettled: () => setUploading(false),
  });

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".docx")) {
      toast.error("Apenas arquivos .docx são aceitos.");
      return;
    }
    setFile(f);
    // Pré-preenche o nome com o nome do arquivo sem extensão
    if (!nome) {
      setNome(f.name.replace(/\.docx$/i, ""));
    }
  };

  const handleSubmit = async () => {
    if (!nome.trim() || !categoria || !file) return;
    setUploading(true);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    uploadMut.mutate({
      nome: nome.trim(),
      categoriaPlanilha: categoria,
      nomeArquivo: file.name,
      tamanho: file.size,
      fileBase64: base64,
    });
  };

  const canSubmit = nome.trim().length > 0 && categoria.length > 0 && file !== null && !uploading;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Upload className="w-4 h-4 text-blue-500" />
        Adicionar / Substituir Modelo
      </h2>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
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
          accept=".docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
            <FileText className="w-5 h-5" />
            <span className="font-medium">{file.name}</span>
            <span className="text-gray-400">({formatBytes(file.size)})</span>
          </div>
        ) : (
          <div className="text-gray-400 space-y-1">
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Clique ou arraste o arquivo <strong>.docx</strong> aqui</p>
          </div>
        )}
      </div>

      {/* Nome e categoria */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Nome do modelo <span className="text-red-500">*</span></label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: CAC, COB CCB, EXEC CONFISSAO"
            className="h-9 text-sm"
          />
          <p className="text-xs text-gray-400">Deve ser único. Se já existir, o arquivo será substituído.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Categoria de planilha <span className="text-red-500">*</span></label>
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
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        {uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
        ) : (
          <><Upload className="w-4 h-4 mr-2" />Enviar Modelo</>
        )}
      </Button>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function ModelosIniciaisPage() {
  const [, navigate] = useLocation();
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const { data: modelosRaw, refetch } = trpc.modelosIniciais.list.useQuery();
  const [modelos, setModelos] = useState<ModeloInicial[] | null>(null);

  const modelosFinal: ModeloInicial[] = modelos ?? ((modelosRaw as ModeloInicial[] | undefined) ?? []);

  const modelosFiltrados = filterCategoria === "todas"
    ? modelosFinal
    : modelosFinal.filter((m) => m.categoriaPlanilha === filterCategoria);

  const handleDeleted = (id: number) => {
    setModelos((prev) => (prev ?? modelosFinal).filter((m) => m.id !== id));
  };

  const handleUpdated = (id: number, nome: string, categoria: string) => {
    setModelos((prev) =>
      (prev ?? modelosFinal).map((m) => m.id === id ? { ...m, nome, categoriaPlanilha: categoria } : m)
    );
  };

  const handleUploaded = () => {
    setModelos(null);
    refetch();
  };

  // Agrupa por categoria para exibição
  const categoriesUsadas = Array.from(new Set(modelosFinal.map((m) => m.categoriaPlanilha))).sort();

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
            <BookOpen className="w-5 h-5 text-blue-600" />
            <div>
              <h1 className="text-base font-semibold text-gray-900">Modelos de Iniciais</h1>
              <p className="text-xs text-gray-500">{modelosFinal.length} modelo(s) cadastrado(s)</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Formulário de upload */}
        <UploadForm onUploaded={handleUploaded} />

        {/* Listagem */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Modelos Cadastrados</h2>
            {/* Filtro por categoria */}
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="h-8 text-xs w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categoriesUsadas.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {modelosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">
                {filterCategoria === "todas"
                  ? "Nenhum modelo cadastrado ainda. Faça o upload do primeiro modelo acima."
                  : `Nenhum modelo na categoria "${filterCategoria}".`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Nome</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Categoria Planilha</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Arquivo</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Tamanho</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {modelosFiltrados.map((m) => (
                    <ModeloRow
                      key={m.id}
                      modelo={m}
                      onDeleted={handleDeleted}
                      onUpdated={handleUpdated}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
