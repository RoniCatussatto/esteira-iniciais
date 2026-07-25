import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Clock, CheckCircle, AlertCircle, ChevronRight, Loader2 } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: lotes, isLoading: loadingLotes } = trpc.lotes.list.useQuery();

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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Erro ao processar planilha");
      toast.success(`Lote criado com ${data.totalDevedores} devedor(es)!`);
      await utils.lotes.list.invalidate();
      navigate(`/lote/${data.loteId}`);
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
          <CardHeader>
            <CardTitle className="text-lg">Lotes Importados</CardTitle>
            <CardDescription>Clique em um lote para visualizar e gerenciar os devedores.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !lotes || lotes.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Nenhum lote importado ainda.</p>
                <p className="text-sm mt-1">Faça o upload de uma planilha BD para começar.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {lotes.map((lote) => (
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
                          {lote.totalDevedores} devedor(es) · Importado em {new Date(lote.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {statusBadge(lote.status)}
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
