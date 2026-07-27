import { useState, useRef, useCallback } from "react";
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
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
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
type DocxItem = {
  file: File;
  nome: string;
  categoria: string;
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

// ── Formulário de upload (múltiplos arquivos) ────────────────────────────────
function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [items, setItems] = useState<DocxItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMut = trpc.modelosIniciais.upload.useMutation();

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const novos: DocxItem[] = arr
      .filter((f) => f.name.toLowerCase().endsWith(".docx"))
      .map((f) => ({
        file: f,
        nome: f.name.replace(/\.docx$/i, ""),
        categoria: "",
        status: "pending" as const,
      }));
    const ignorados = arr.length - novos.length;
    if (ignorados > 0) toast.warning(`${ignorados} arquivo(s) ignorado(s) — apenas .docx é aceito.`);
    setItems((prev) => {
      const existentes = new Set(prev.map((i) => i.file.name));
      return [...prev, ...novos.filter((n) => !existentes.has(n.file.name))];
    });
  }, []);

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<DocxItem>) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const pendentes = items.filter((i) => i.status === "pending");
  const prontos = pendentes.filter((i) => i.nome.trim() && i.categoria);

  const handleSubmit = async () => {
    if (prontos.length === 0) return;
    setUploading(true);
    let sucesso = 0;
    let falha = 0;
    for (const item of prontos) {
      setItems((prev) =>
        prev.map((i) => i.file.name === item.file.name ? { ...i, status: "uploading" } : i)
      );
      try {
        const base64 = await fileToBase64(item.file);
        await uploadMut.mutateAsync({
          nome: item.nome.trim(),
          categoriaPlanilha: item.categoria,
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
      toast.success(`${sucesso} modelo(s) enviado(s) com sucesso.`);
      onUploaded();
    }
    if (falha > 0) toast.error(`${falha} modelo(s) falharam.`);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.status !== "done"));
    }, 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Upload className="w-4 h-4 text-blue-500" />
        Adicionar / Substituir Modelos
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
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">
          Clique ou arraste <strong>um ou vários arquivos .docx</strong> aqui
        </p>
      </div>

      {/* Lista de arquivos com campos editáveis */}
      {items.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={item.file.name}
              className={`rounded-lg border p-3 space-y-2 ${
                item.status === "done" ? "bg-green-50 border-green-200" :
                item.status === "error" ? "bg-red-50 border-red-200" :
                item.status === "uploading" ? "bg-blue-50 border-blue-200" :
                "bg-gray-50 border-gray-200"
              }`}
            >
              {/* Cabeçalho do item */}
              <div className="flex items-center gap-2">
                {item.status === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : item.status === "error" ? (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                ) : item.status === "uploading" ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="text-xs text-gray-500 truncate flex-1">{item.file.name}</span>
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
              {/* Campos editáveis (só quando pendente) */}
              {item.status === "pending" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">
                      Nome do modelo <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.nome}
                      onChange={(e) => updateItem(idx, { nome: e.target.value })}
                      placeholder="Ex: CAC, COB CCB"
                      className="h-8 text-xs"
                      disabled={uploading}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">
                      Categoria <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={item.categoria}
                      onValueChange={(v) => updateItem(idx, { categoria: v })}
                      disabled={uploading}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {/* Mensagem de erro */}
              {item.status === "error" && item.error && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {item.error}
                </p>
              )}
              {/* Resumo quando concluído */}
              {item.status === "done" && (
                <p className="text-xs text-green-700 font-medium">
                  ✓ {item.nome} — {item.categoria}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Aviso sobre itens sem categoria */}
      {pendentes.length > 0 && prontos.length < pendentes.length && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {pendentes.length - prontos.length} arquivo(s) sem nome ou categoria — preencha antes de enviar.
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
          disabled={prontos.length === 0 || uploading}
          className="flex-1"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" />
              Enviar {prontos.length > 0 ? `${prontos.length} modelo${prontos.length !== 1 ? "s" : ""}` : "Modelos"}
            </>
          )}
        </Button>
      </div>
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
