import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Clock, CheckCircle, AlertCircle,
  ChevronRight, Loader2, ChevronLeft, Trash2, AlertTriangle,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRef } from "react";

const PAGE_SIZE = 10;

export default function Home() {
  const [, navigate] = useLocation();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data, isLoading: loadingLotes } = trpc.lotes.list.useQuery(
    { page, pageSize: PAGE_SIZE }
  );

  const lotes = data?.lotes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limparMutation = trpc.lotes.limparAntigos.useMutation({
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("Nenhum lote com mais de 30 dias encontrado.");
      } else {
        toast.success(`${count} lote(s) antigo(s) excluído(s).`);
      }
      // Se a página atual ficou vazia após a limpeza, volta para a 1
      setPage(1);
      utils.lotes.list.invalidate();
    },
    onError: (err) => toast.error("Erro ao limpar: " + err.message),
  });

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Envie apenas arquivos Excel (.xlsx ou .xls)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload/bd", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro ao processar planilha");
      toast.success(`Lote criado com ${result.totalDevedores} devedor(es)!`);
      setPage(1);
      await utils.lotes.list.invalidate();
      navigate(`/lote/${result.loteId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      aguardando: { label: "Aguardando", variant: "secondary" },
      em_processamento: { label: "Em processamento", variant: "default" },
      concluido: { label: "Concluído", variant: "outline" },
      erro: { label: "Erro", variant: "destructive" },
    };
    const s = map[status] ?? { label: status, variant: "secondary" as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  }

  function isOlderThan30Days(date: Date | string) {
    return Date.now() - new Date(date).getTime() > 30 * 24 * 60 * 60 * 1000;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <FileSpreadsheet className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Iniciais Calc</h1>
            <p className="text-sm text-gray-500">Sistema de Elaboração de Planilhas e Petições Iniciais</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Etapa 1 — Importar Planilha BD</CardTitle>
            <CardDescription>
              Faça o upload da planilha Excel com os dados do lote de casos. O sistema irá extrair e salvar os dados de cada devedor separadamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer
                ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
                ${uploading ? "opacity-60 pointer-events-none" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <p className="text-gray-600 font-medium">Processando planilha...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-gray-400" />
                  <div>
                    <p className="text-gray-700 font-medium">Clique ou arraste a planilha BD aqui</p>
                    <p className="text-sm text-gray-400 mt-1">Formatos aceitos: .xlsx, .xls</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lotes List */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Lotes Importados</CardTitle>
              <CardDescription>
                {total > 0
                  ? `${total} lote(s) no histórico. Clique em um lote para visualizar os devedores.`
                  : "Clique em um lote para visualizar e gerenciar os devedores."}
              </CardDescription>
            </div>
            {total > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Limpar antigos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      Excluir lotes antigos
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os lotes importados há mais de 30 dias serão excluídos permanentemente, incluindo todos os dados dos devedores vinculados. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => limparMutation.mutate()}
                    >
                      {limparMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Excluir antigos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardHeader>
          <CardContent>
            {loadingLotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : lotes.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Nenhum lote importado ainda.</p>
                <p className="text-sm mt-1">Faça o upload de uma planilha BD para começar.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {lotes.map((lote) => {
                    const antigo = isOlderThan30Days(lote.createdAt);
                    return (
                      <button
                        key={lote.id}
                        className="w-full text-left flex items-center justify-between px-2 py-4 hover:bg-gray-50 rounded-lg transition-colors group"
                        onClick={() => navigate(`/lote/${lote.id}`)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-0.5">
                            {lote.status === "concluido" ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : lote.status === "erro" ? (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{lote.nome}</p>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {lote.totalDevedores} devedor(es) · Importado em{" "}
                              {new Date(lote.createdAt).toLocaleString("pt-BR")}
                              {antigo && (
                                <span className="ml-2 text-amber-600 font-medium">· +30 dias</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {statusBadge(lote.status)}
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                    <p className="text-sm text-gray-500">
                      Página {page} de {totalPages} · {total} lote(s)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="gap-1"
                      >
                        Próxima <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
