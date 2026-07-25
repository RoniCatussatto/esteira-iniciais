import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, FileSpreadsheet, Loader2, FolderOpen, FileText, FileImage,
  Trash2, Plus, ExternalLink, CheckCircle, AlertCircle, Upload,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Documento = {
  id: number;
  loteId: number;
  devedorId: number;
  nomeArquivo: string;
  nomePasta: string | null;
  fileKey: string;
  fileUrl: string;
  mimeType: string | null;
  tamanho: number | null;
  createdAt: Date | string;
};

type UploadResultado = {
  arquivo: string;
  pasta: string;
  devedorId: number | null;
  devedorNome: string | null;
  score: number;
  fileUrl: string;
};

function fileIcon(mimeType: string | null, nome: string) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.includes("pdf") || ext === "pdf") return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (mimeType?.includes("image") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
    return <FileImage className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  if (["doc", "docx"].includes(ext)) return <FileText className="w-4 h-4 text-blue-700 flex-shrink-0" />;
  if (["xls", "xlsx"].includes(ext)) return <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />;
  return <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const loteId = parseInt(params.id ?? "0");

  const { data: lote, isLoading: loadingLote } = trpc.lotes.getById.useQuery({ id: loteId });
  const { data: devedores, isLoading: loadingDevedores } = trpc.lotes.getDevedores.useQuery({ loteId });
  const { data: documentos, isLoading: loadingDocs, refetch: refetchDocs } = trpc.documentos.getByLote.useQuery({ loteId });
  const utils = trpc.useUtils();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ atual: number; total: number } | null>(null);
  const [uploadResultado, setUploadResultado] = useState<{
    totalArquivos: number;
    vinculados: number;
    semVinculo: number;
    resultados: UploadResultado[];
  } | null>(null);
  const [expandedDevedores, setExpandedDevedores] = useState<Set<number>>(new Set());
  const [addingToDevedor, setAddingToDevedor] = useState<number | null>(null);
  const addFileRef = useRef<HTMLInputElement>(null);

  const deleteMutation = trpc.documentos.delete.useMutation({
    onSuccess: () => {
      toast.success("Documento removido.");
      refetchDocs();
    },
    onError: (err) => toast.error("Erro ao remover: " + err.message),
  });

  // Agrupa documentos por devedorId
  const docsPorDevedor = (documentos ?? []).reduce<Record<number, Documento[]>>((acc, doc) => {
    if (!acc[doc.devedorId]) acc[doc.devedorId] = [];
    acc[doc.devedorId].push(doc as Documento);
    return acc;
  }, {});

  function toggleDevedor(id: number) {
    setExpandedDevedores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Upload de múltiplas pastas via webkitdirectory
  const folderInputRef = useRef<HTMLInputElement>(null);

  async function handleFolderUpload(fileList: FileList) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setUploading(true);
    setUploadProgress({ atual: 0, total: files.length });
    setUploadResultado(null);

    try {
      const formData = new FormData();
      files.forEach((file, i) => {
        formData.append("files", file);
        // webkitRelativePath = "NomePasta/arquivo.pdf"
        const parts = file.webkitRelativePath?.split("/") ?? [];
        const nomePasta = parts.length >= 2 ? parts[0] : file.name;
        formData.append("nomePasta", nomePasta);
      });

      setUploadProgress({ atual: files.length, total: files.length });

      const response = await fetch(`/api/upload/docs/${loteId}`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro no upload");

      setUploadResultado(result);
      toast.success(`${result.vinculados} arquivo(s) vinculado(s) com sucesso!`);
      if (result.semVinculo > 0) {
        toast.warning(`${result.semVinculo} arquivo(s) não foram vinculados a nenhum devedor.`);
      }
      refetchDocs();
      // Expandir todos os devedores que receberam documentos
      const idsComDocs = new Set(
        (result.resultados as UploadResultado[])
          .filter((r) => r.devedorId !== null)
          .map((r) => r.devedorId as number)
      );
      setExpandedDevedores(idsComDocs);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar arquivos");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // Upload individual para um devedor específico
async function handleAddDocToDevedor(devedorId: number, files: FileList) {
  if (!files || files.length === 0) return;
  setAddingToDevedor(devedorId);
  try {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append("files", file);
    });
    // Usa o endpoint direto — sem fuzzy matching, vínculo garantido
    const response = await fetch(`/api/upload/docs/${loteId}/devedor/${devedorId}`, {
      method: "POST",
      body: formData,
    });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro no upload");
      toast.success(`${result.vinculados} arquivo(s) adicionado(s)!`);
      refetchDocs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar arquivo");
    } finally {
      setAddingToDevedor(null);
    }
  }

  if (loadingLote || loadingDevedores || loadingDocs) {
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

  const totalDocs = documentos?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/lote/${loteId}`)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar aos Dados
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{lote.nome}</h1>
            <p className="text-sm text-gray-500">
              Etapa 2 — Upload de Documentos · {totalDocs} arquivo(s) enviado(s)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Upload de Pastas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              Subir Pastas de Documentos
            </CardTitle>
            <CardDescription>
              Selecione as pastas dos casos. Cada pasta deve ter o nome do devedor no título.
              O sistema vinculará automaticamente os arquivos ao devedor correspondente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Input oculto para seleção de pastas */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore — atributo não-padrão suportado pelos navegadores modernos
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFolderUpload(e.target.files)}
            />

            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer
                ${uploading ? "opacity-60 pointer-events-none border-gray-300" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}`}
              onClick={() => !uploading && folderInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                // Drag-and-drop de pastas não é suportado universalmente; orientar o usuário
                toast.info("Use o botão para selecionar as pastas.");
              }}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <p className="text-gray-700 font-medium">
                    Enviando arquivos...
                    {uploadProgress && ` (${uploadProgress.atual} / ${uploadProgress.total})`}
                  </p>
                  <p className="text-sm text-gray-400">Aguarde, isso pode levar alguns instantes.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-gray-400" />
                  <div>
                    <p className="text-gray-700 font-medium">Clique para selecionar as pastas</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Selecione múltiplas pastas de uma vez. Cada pasta = um devedor.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Resultado do último upload */}
            {uploadResultado && (
              <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    Resultado do upload: {uploadResultado.totalArquivos} arquivo(s) processado(s)
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-sm text-green-700">
                      <CheckCircle className="w-4 h-4" /> {uploadResultado.vinculados} vinculado(s)
                    </span>
                    {uploadResultado.semVinculo > 0 && (
                      <span className="flex items-center gap-1 text-sm text-amber-700">
                        <AlertCircle className="w-4 h-4" /> {uploadResultado.semVinculo} sem vínculo
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {uploadResultado.resultados.map((r, i) => (
                    <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                      {r.devedorId ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-gray-500 truncate flex-1">{r.pasta}/{r.arquivo}</span>
                      {r.devedorId ? (
                        <span className="text-gray-700 font-medium truncate">{r.devedorNome}</span>
                      ) : (
                        <span className="text-amber-600">Sem vínculo</span>
                      )}
                      {r.score > 0 && (
                        <Badge variant="outline" className="text-xs">{r.score}%</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista de Devedores com Documentos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos por Devedor</CardTitle>
            <CardDescription>
              Clique em um devedor para ver seus documentos. Use os botões para adicionar ou remover arquivos individualmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!devedores || devedores.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Nenhum devedor no lote.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {devedores.map((dev, idx) => {
                  const docs = docsPorDevedor[dev.id] ?? [];
                  const isExpanded = expandedDevedores.has(dev.id);
                  return (
                    <div key={dev.id}>
                      {/* Linha do devedor */}
                      <button
                        className="w-full text-left flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                        onClick={() => toggleDevedor(dev.id)}
                      >
                        <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{dev.contrarioNome ?? "—"}</p>
                          <p className="text-sm text-gray-500">CPF: {dev.contrarioCpf ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {docs.length > 0 ? (
                            <Badge variant="outline" className="gap-1">
                              <FileText className="w-3 h-3" /> {docs.length} doc(s)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-gray-400">Sem documentos</Badge>
                          )}
                          {/* Botão adicionar documento individual */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              id={`add-doc-${dev.id}`}
                              onChange={(e) => {
                                if (e.target.files) handleAddDocToDevedor(dev.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={addingToDevedor === dev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                document.getElementById(`add-doc-${dev.id}`)?.click();
                              }}
                            >
                              {addingToDevedor === dev.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              Adicionar
                            </Button>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {/* Lista de documentos expandida */}
                      {isExpanded && (
                        <div className="bg-gray-50 border-t border-gray-100 px-6 py-3">
                          {docs.length === 0 ? (
                            <p className="text-sm text-gray-400 py-2 text-center">
                              Nenhum documento enviado para este devedor.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {docs.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white transition-colors group"
                                >
                                  {fileIcon(doc.mimeType, doc.nomeArquivo)}
                                  <button
                                    className="flex-1 min-w-0 text-left"
                                    onClick={() => window.open(doc.fileUrl, "_blank")}
                                  >
                                    <span className="text-sm text-blue-700 hover:underline truncate block">
                                      {doc.nomeArquivo}
                                    </span>
                                    {doc.tamanho && (
                                      <span className="text-xs text-gray-400">{formatBytes(doc.tamanho)}</span>
                                    )}
                                  </button>
                                  <ExternalLink
                                    className="w-3.5 h-3.5 text-gray-400 hover:text-blue-600 cursor-pointer flex-shrink-0"
                                    onClick={() => window.open(doc.fileUrl, "_blank")}
                                  />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remover documento?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          O arquivo <strong>{doc.nomeArquivo}</strong> será removido permanentemente deste devedor.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-red-600 hover:bg-red-700"
                                          onClick={() => deleteMutation.mutate({ id: doc.id })}
                                        >
                                          Remover
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
