import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Package, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function GerarPlanilhasPage() {
  const { id } = useParams<{ id: string }>();
  const loteId = parseInt(id ?? "0");
  const [, navigate] = useLocation();

  const [gerando, setGerando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  const { data: lote } = trpc.lotes.getById.useQuery({ id: loteId }, { enabled: !!loteId });
  const { data: devedores } = trpc.lotes.getDevedores.useQuery({ loteId }, { enabled: !!loteId && !isNaN(loteId) });

  // Verificar se todos os devedores têm modelo definido
  const devedoresSemModelo = (devedores ?? []).filter((d: { modeloInicial?: string | null; contrarioNome?: string | null; id: number }) => !d.modeloInicial);
  const totalDevedores = (devedores ?? []).length;
  const totalComModelo = totalDevedores - devedoresSemModelo.length;

  async function handleGerarPacote() {
    setGerando(true);
    setConcluido(false);
    setAvisos([]);

    try {
      // Fazer download do ZIP via fetch direto (não tRPC, pois é um arquivo binário)
      const response = await fetch(`/api/gerar-pacote/${loteId}`);

      if (!response.ok) {
        const erro = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(erro.error ?? `Erro ${response.status}`);
      }

      // Extrair avisos do header se houver
      const avisosHeader = response.headers.get("X-Avisos");
      if (avisosHeader) {
        try {
          setAvisos(JSON.parse(decodeURIComponent(avisosHeader)));
        } catch {
          // ignorar
        }
      }

      // Disparar download do ZIP
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomeLote = lote?.nome?.replace(/[^a-zA-Z0-9_\- ]/g, "_") ?? "lote";
      a.href = url;
      a.download = `Pacote_${nomeLote}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setConcluido(true);
      toast.success("Pacote gerado e baixado com sucesso!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar pacote";
      toast.error(msg);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/lote/${loteId}/definir-inicial`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex-1 flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Gerar Planilhas de Cálculo</h1>
            {lote && (
              <p className="text-sm text-gray-500">{lote.cooperativa} — {lote.nome}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Resumo do lote */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800">Resumo do Lote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total de devedores</span>
              <span className="font-medium">{totalDevedores}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Com modelo definido</span>
              <span className="font-medium text-green-700">{totalComModelo}</span>
            </div>
            {devedoresSemModelo.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">{devedoresSemModelo.length} devedor(es) sem modelo definido:</p>
                  <ul className="mt-1 space-y-0.5">
                    {devedoresSemModelo.map((d: { id: number; contrarioNome?: string | null }) => (
                      <li key={d.id} className="text-amber-700">• {d.contrarioNome}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-amber-600">Eles serão incluídos no pacote sem modelo de planilha associado.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instruções */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-2">
            <p>Ao clicar em <strong>Gerar e Baixar Pacote</strong>, o sistema irá:</p>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Calcular os índices de correção (IPCA/Selic), multa e juros para cada contrato</li>
              <li>Montar o arquivo <code className="bg-gray-100 px-1 rounded">dados.json</code> com todos os dados calculados</li>
              <li>Incluir os modelos de planilha <code className="bg-gray-100 px-1 rounded">.xlsx</code> correspondentes</li>
              <li>Incluir o script <code className="bg-gray-100 px-1 rounded">gerar.js</code> para execução local</li>
              <li>Baixar o pacote <code className="bg-gray-100 px-1 rounded">.zip</code> completo</li>
            </ol>
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="font-medium text-blue-800 mb-1">Para gerar as planilhas no Windows:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700">
                <li>Extraia o ZIP em uma pasta</li>
                <li>Abra o terminal nessa pasta e execute: <code className="bg-blue-100 px-1 rounded">npm install adm-zip</code></li>
                <li>Execute: <code className="bg-blue-100 px-1 rounded">node gerar.js</code></li>
                <li>As planilhas serão salvas na pasta <code className="bg-blue-100 px-1 rounded">saida/</code></li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Avisos após geração */}
        {avisos.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Avisos da geração
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-amber-700 space-y-1">
                {avisos.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Botão principal */}
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={handleGerarPacote}
            disabled={gerando || totalDevedores === 0}
            className="gap-2 px-8"
          >
            {gerando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Gerando pacote...
              </>
            ) : concluido ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Baixar novamente
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Gerar e Baixar Pacote
              </>
            )}
          </Button>

          {concluido && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Pacote baixado com sucesso! Verifique sua pasta de downloads.
            </div>
          )}
          {concluido && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/lote/${loteId}/upload-planilhas-pdf`)}
            >
              Próximo passo: Upload dos PDFs revisados
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
