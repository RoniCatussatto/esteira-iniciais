import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Building2,
  User,
  Table2,
  Loader2,
  CheckCircle2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// Tipo espelhando o retorno do backend
interface ExtracaoItem {
  id: number;
  numeroContrato: string;
  dadoPlanilha01: string | null;
  dadoPlanilha02: string | null;
  dadoPlanilha03: string | null;
  dadoPlanilha04: string | null;
  multa2pct: string | null;
  moraEspecifica: string | null;
  indiceCorrecao: string | null;
  tipoContrato: string | null;
}

interface DadosPeticaoDevedor {
  devedorId: number;
  contrarioNome: string;
  contrarioCpf: string | null;
  contrarioEndereco: string | null;
  cooperativa: string | null;
  foro: string | null;
  contratos: string | null;
  valorCausa: string | null;
  vencBordero: string | null;
  valorBordero: string | null;
  dataBordero: string | null;
  veiculoModelo: string | null;
  veiculoAno: string | null;
  veiculoPlaca: string | null;
  veiculoRenavam: string | null;
  veiculoChassis: string | null;
  modeloInicial: string | null;
  clienteNomeCompleto: string | null;
  clienteDoc: string | null;
  clienteEnderecoCoop: string | null;
  clienteParagrafaInicial: string | null;
  extracoes: ExtracaoItem[];
  placeholders: string[];
  valoresPlaceholders: Record<string, string>;
}

function tipoContratoLabel(tipo: string | null) {
  if (tipo === "cartao") return "Cartão";
  if (tipo === "cheque") return "Cheque Especial";
  return "Empréstimo";
}

function tipoContratoBadgeColor(tipo: string | null) {
  if (tipo === "cartao") return "bg-purple-100 text-purple-700";
  if (tipo === "cheque") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

// Placeholders que precisam de textarea maior
const PLACEHOLDERS_GRANDES = ["PARAGRAFO_INICIAL", "ENDERECO_COOP", "DEVEDOR_ENDERECO_1", "VALOR_CAUSA"];

// Placeholders que NÃO devem ser exibidos na revisão (serão preenchidos manualmente pelo usuário no Word)
const PLACEHOLDERS_OCULTOS = ["PLANILHA"];

/** Nomes amigáveis para placeholders com nomenclatura técnica */
const PLACEHOLDER_LABELS: Record<string, string> = {
  'dadoPlanilha01_Cartao': 'Conta-Cartão',
  'dadoPlanilha02_Cartao': 'Extrato de Cartão',
  'dadoPlanilha03_Cartao': 'Venc. Cartão',
  'dadoPlanilha01_CE': 'Instrumento CE',
  'dadoPlanilha02_CE': 'Conta Corrente CE',
};

export default function GerarPeticoesPage() {
  const { id } = useParams<{ id: string }>();
  const loteId = parseInt(id ?? "0");
  const [, navigate] = useLocation();

  const [indiceAtual, setIndiceAtual] = useState(0);
  const [valoresPorDevedor, setValoresPorDevedor] = useState<Record<number, Record<string, string>>>({});
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ zipUrl: string; totalGerados: number; erros: Array<{ devedorId: number; nome: string; erro: string }> } | null>(null);

  const { data: lote } = trpc.lotes.getById.useQuery({ id: loteId });
  const { data: dadosList, isLoading } = trpc.peticoes.getDados.useQuery({ loteId });
  const gerarMutation = trpc.peticoes.gerar.useMutation();

  // Inicializar valoresPorDevedor quando os dados chegam
  useEffect(() => {
    if (!dadosList) return;
    const init: Record<number, Record<string, string>> = {};
    for (const d of dadosList) {
      init[d.devedorId] = { ...d.valoresPlaceholders };
    }
    setValoresPorDevedor(init);
  }, [dadosList]);

  const total = dadosList?.length ?? 0;
  const devAtual: DadosPeticaoDevedor | undefined = dadosList?.[indiceAtual] as DadosPeticaoDevedor | undefined;
  const valoresAtual = devAtual ? (valoresPorDevedor[devAtual.devedorId] ?? {}) : {};

  function setValorPlaceholder(devedorId: number, placeholder: string, valor: string) {
    setValoresPorDevedor(prev => ({
      ...prev,
      [devedorId]: { ...(prev[devedorId] ?? {}), [placeholder]: valor },
    }));
  }

  async function handleGerar() {
    if (!dadosList || dadosList.length === 0) return;
    setGerando(true);
    try {
      const dadosPorDevedor = dadosList.map(d => ({
        devedorId: d.devedorId,
        modeloInicial: d.modeloInicial ?? '',
        cooperativa: d.cooperativa ?? '',
        contrarioNome: d.contrarioNome,
        valoresPlaceholders: valoresPorDevedor[d.devedorId] ?? d.valoresPlaceholders,
      }));
      const res = await gerarMutation.mutateAsync({ loteId, dadosPorDevedor });
      setResultado(res);
      if (res.erros.length === 0) {
        toast.success(`${res.totalGerados} petição(ões) gerada(s) com sucesso!`);
      } else {
        toast.warning(`${res.totalGerados} gerada(s), ${res.erros.length} com erro.`);
      }
    } catch (err: any) {
      toast.error("Erro ao gerar petições: " + (err?.message ?? String(err)));
    } finally {
      setGerando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Carregando dados das petições...</span>
        </div>
      </div>
    );
  }

  if (!dadosList || dadosList.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto" />
          <p className="text-gray-600">Nenhum devedor encontrado neste lote.</p>
          <Button variant="outline" onClick={() => navigate(`/lote/${loteId}/upload-planilhas-pdf`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/lote/${loteId}/upload-planilhas-pdf`)}
              className="gap-2 text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div>
              <h1 className="text-base font-semibold text-gray-900">Gerar Petições</h1>
              <p className="text-xs text-gray-500">{lote?.nome ?? `Lote #${loteId}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {resultado && (
              <a
                href={resultado.zipUrl}
                className="inline-flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-1.5 hover:bg-green-100 transition-colors"
              >
               <Download className="w-4 h-4" />
                Baixar ZIP ({resultado.totalGerados} {resultado.totalGerados !== 1 ? 'petições' : 'petição'})
              </a>
            )}
            <Button
              onClick={handleGerar}
              disabled={gerando}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {gerando ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><FileText className="w-4 h-4" /> Gerar Petições</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Navegação do carrossel */}
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">
              Caso {indiceAtual + 1} de {total}
            </span>
            {devAtual?.modeloInicial && (
              <Badge variant="outline" className="text-xs font-mono">
                {devAtual.modeloInicial}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIndiceAtual(i => Math.max(0, i - 1))}
              disabled={indiceAtual === 0}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            {/* Indicadores de página */}
            <div className="flex gap-1">
              {dadosList.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndiceAtual(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === indiceAtual ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  title={dadosList[i].contrarioNome}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIndiceAtual(i => Math.min(total - 1, i + 1))}
              disabled={indiceAtual === total - 1}
              className="gap-1"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {devAtual && (
          <div className="space-y-4">

            {/* 1. Dados da Cliente/Cooperativa */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  Dados da Cooperativa
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Nome Fantasia:</span>
                    <span className="font-medium text-gray-900">{devAtual.cooperativa ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Razão Social:</span>
                    <span className="font-medium text-gray-900">{devAtual.clienteNomeCompleto ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">CNPJ:</span>
                    <span className="font-medium text-gray-900">{devAtual.clienteDoc ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Foro:</span>
                    <span className="font-medium text-gray-900">{devAtual.foro ?? "—"}</span>
                  </div>
                  {devAtual.clienteEnderecoCoop && (
                    <div className="flex gap-2 sm:col-span-2">
                      <span className="text-gray-500 shrink-0 w-32">Endereço:</span>
                      <span className="font-medium text-gray-900">{devAtual.clienteEnderecoCoop}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 2. Dados do Devedor */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-500" />
                  Dados do Devedor
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Nome:</span>
                    <span className="font-medium text-gray-900">{devAtual.contrarioNome || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">CPF:</span>
                    <span className="font-medium text-gray-900">{devAtual.contrarioCpf ?? "—"}</span>
                  </div>
                  {devAtual.contrarioEndereco && (
                    <div className="flex gap-2 sm:col-span-2">
                      <span className="text-gray-500 shrink-0 w-32">Endereço:</span>
                      <span className="font-medium text-gray-900">{devAtual.contrarioEndereco}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Data Borderô:</span>
                    <span className="font-medium text-gray-900">{devAtual.dataBordero ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Vencimento:</span>
                    <span className="font-medium text-gray-900">{devAtual.vencBordero ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-32">Valor Borderô:</span>
                    <span className="font-medium text-gray-900">{devAtual.valorBordero ?? "—"}</span>
                  </div>
                  {devAtual.veiculoModelo && (
                    <>
                      <div className="flex gap-2">
                        <span className="text-gray-500 shrink-0 w-32">Veículo:</span>
                        <span className="font-medium text-gray-900">{devAtual.veiculoModelo} {devAtual.veiculoAno ? `(${devAtual.veiculoAno})` : ''}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-500 shrink-0 w-32">Placa / RENAVAM:</span>
                        <span className="font-medium text-gray-900">{devAtual.veiculoPlaca ?? "—"} / {devAtual.veiculoRenavam ?? "—"}</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 3. Contratos e Valor da Causa */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-green-500" />
                  Contratos e Valor da Causa
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-3">
                {devAtual.extracoes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contrato</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dado 01</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dado 02</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dado 03</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo Dev.</th>
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Multa</th>
                          <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Índice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devAtual.extracoes.map((ext) => (
                          <tr key={ext.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 pr-4 font-mono text-xs font-semibold text-gray-800">{ext.numeroContrato}</td>
                            <td className="py-2 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tipoContratoBadgeColor(ext.tipoContrato)}`}>
                                {tipoContratoLabel(ext.tipoContrato)}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-gray-700">{ext.dadoPlanilha01 || "—"}</td>
                            <td className="py-2 pr-4 text-gray-700">{ext.dadoPlanilha02 || "—"}</td>
                            <td className="py-2 pr-4 text-gray-700">{ext.dadoPlanilha03 || "—"}</td>
                            <td className="py-2 pr-4 text-gray-700 font-medium">{ext.dadoPlanilha04 || "—"}</td>
                            <td className="py-2 pr-4 text-gray-700">
                              {ext.multa2pct === "sim" ? "2%" : ext.multa2pct === "nao" ? "0%" : "—"}
                            </td>
                            <td className="py-2 text-gray-700 uppercase text-xs">{ext.indiceCorrecao ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Nenhum contrato cadastrado.</p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-sm text-gray-500">Valor da Causa:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {devAtual.valorCausa
                      ? `R$ ${devAtual.valorCausa}`
                      : <span className="text-yellow-600 font-normal">Não informado</span>}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 4. Campos dos Placeholders */}
            {devAtual.placeholders.length > 0 ? (
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Campos da Petição
                    <span className="text-xs font-normal text-gray-400 ml-1">
                      (modelo: {devAtual.modeloInicial ?? "não definido"})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {devAtual.placeholders.filter(ph => !PLACEHOLDERS_OCULTOS.includes(ph)).map((ph) => {
                      const isGrande = PLACEHOLDERS_GRANDES.includes(ph);
                      return (
                        <div key={ph} className={isGrande ? "sm:col-span-2" : ""}>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            {PLACEHOLDER_LABELS[ph] ?? ph.replace(/_/g, ' ')}
                          </label>
                          {isGrande ? (
                            <Textarea
                              value={valoresAtual[ph] ?? ''}
                              onChange={(e) => setValorPlaceholder(devAtual.devedorId, ph, e.target.value)}
                              placeholder={`{${ph}}`}
                              className="text-sm min-h-[100px] resize-y"
                            />
                          ) : (
                            <Input
                              value={valoresAtual[ph] ?? ''}
                              onChange={(e) => setValorPlaceholder(devAtual.devedorId, ph, e.target.value)}
                              placeholder={`{${ph}}`}
                              className="text-sm h-9"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-yellow-300 bg-yellow-50">
                <CardContent className="px-5 py-4">
                  <div className="flex items-center gap-2 text-yellow-700 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {devAtual.modeloInicial
                        ? `Nenhum placeholder encontrado no modelo "${devAtual.modeloInicial}". Verifique se o modelo está correto.`
                        : "Modelo de petição não definido para este devedor. Volte à etapa Definir Inicial."}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}

        {/* Resultado da geração */}
        {resultado && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {resultado.totalGerados} petição(ões) gerada(s) com sucesso!
            </div>
            {resultado.erros.length > 0 && (
              <div className="space-y-1">
                {resultado.erros.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-red-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>{e.nome}:</strong> {e.erro}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navegação inferior */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => setIndiceAtual(i => Math.max(0, i - 1))}
            disabled={indiceAtual === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </Button>
          <span className="text-sm text-gray-500">{indiceAtual + 1} / {total}</span>
          <Button
            variant="outline"
            onClick={() => setIndiceAtual(i => Math.min(total - 1, i + 1))}
            disabled={indiceAtual === total - 1}
            className="gap-2"
          >
            Próximo <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

      </div>
    </div>
  );
}
