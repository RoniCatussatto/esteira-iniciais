import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Plus, TrendingUp, Calendar, ArrowUp, ArrowDown, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

function mesAnoParaTexto(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes) - 1]}/${ano}`;
}

function textoParaMesAno(texto: string): string {
  const [mes, ano] = texto.split("/");
  const idx = MESES.indexOf(mes.toLowerCase());
  if (idx === -1 || !ano) return "";
  return `${ano}-${String(idx + 1).padStart(2, "0")}`;
}

type Indice = {
  id: number;
  mesAno: string;
  dataTexto: string;
  ipca: string;
  selic: string;
};

type EditState = { id: number; ipca: string; selic: string } | null;

export default function IndicesPage() {
  const { data: indices = [], refetch, isLoading } = trpc.indices.list.useQuery();
  const updateMut = trpc.indices.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); toast.success("Índice atualizado."); } });
  const upsertMut = trpc.indices.upsert.useMutation({ onSuccess: () => { refetch(); setNovoMesAno(""); setNovoIpca(""); setNovoSelic(""); toast.success("Índice adicionado."); } });
  const deleteMut = trpc.indices.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Índice removido."); } });

  const [editing, setEditing] = useState<EditState>(null);
  const [filtroAno, setFiltroAno] = useState<string>("todos");
  // Padrão sem filtro: decrescente (mais recentes primeiro). Com filtro: crescente.
  const [ordemDesc, setOrdemDesc] = useState<boolean>(true);
  const [novoMesAno, setNovoMesAno] = useState("");
  const [novoIpca, setNovoIpca] = useState("");
  const [novoSelic, setNovoSelic] = useState("");
  const [mostrarNovo, setMostrarNovo] = useState(false);

  const anos = useMemo(() => {
    const set = new Set<string>();
    indices.forEach(i => set.add(i.mesAno.split("-")[0]));
    return Array.from(set).sort();
  }, [indices]);

  const indicesFiltrados = useMemo(() => {
    if (filtroAno === "todos") return indices;
    return indices.filter(i => i.mesAno.startsWith(filtroAno));
  }, [indices, filtroAno]);

  const indicesOrdenados = useMemo(() => {
    const arr = [...indicesFiltrados];
    return ordemDesc ? arr.reverse() : arr;
  }, [indicesFiltrados, ordemDesc]);

  // Quando o filtro muda, ajusta o padrão de ordenação
  const handleFiltroAno = (val: string) => {
    setFiltroAno(val);
    // Sem filtro → decrescente; com filtro de ano → crescente
    setOrdemDesc(val === "todos");
  };

  const ultimoIndice = indices.length > 0 ? indices[indices.length - 1] : null;

  function startEdit(ind: Indice) {
    setEditing({ id: ind.id, ipca: ind.ipca, selic: ind.selic });
  }

  function saveEdit() {
    if (!editing) return;
    updateMut.mutate({ id: editing.id, ipca: parseFloat(editing.ipca), selic: parseFloat(editing.selic) });
  }

  function addNovo() {
    const mesAno = novoMesAno.includes("/") ? textoParaMesAno(novoMesAno) : novoMesAno;
    if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) {
      toast.error("Formato de mês/ano inválido. Use YYYY-MM ou mmm/AAAA (ex: ago/2026).");
      return;
    }
    const ipca = parseFloat(novoIpca);
    const selic = parseFloat(novoSelic);
    if (isNaN(ipca) || isNaN(selic)) {
      toast.error("IPCA e Selic devem ser números válidos.");
      return;
    }
    upsertMut.mutate({ mesAno, dataTexto: mesAnoParaTexto(mesAno), ipca, selic });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Início
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Índices de Correção
          </h1>
          <p className="text-sm text-gray-500">
            Valores mensais de IPCA e Selic acumulados utilizados nos cálculos de atualização monetária.
          </p>
        </div>
        <Button onClick={() => setMostrarNovo(v => !v)} variant="default" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Índice
        </Button>
      </div>

      <div className="container py-8 max-w-4xl mx-auto px-4">

      {/* Último índice disponível */}
      {ultimoIndice && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Último índice</CardDescription>
              <CardTitle className="text-lg">{ultimoIndice.dataTexto}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>IPCA (último)</CardDescription>
              <CardTitle className="text-lg text-blue-600 dark:text-blue-400">{parseFloat(ultimoIndice.ipca).toFixed(6)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Selic acumulada (último)</CardDescription>
              <CardTitle className="text-lg text-emerald-600 dark:text-emerald-400">{parseFloat(ultimoIndice.selic).toFixed(2)}%</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Formulário novo índice */}
      {mostrarNovo && (
        <Card className="mb-6 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Adicionar / Atualizar Índice</CardTitle>
            <CardDescription>Informe o mês/ano e os valores. Se o mês já existir, o registro será atualizado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Mês/Ano</label>
                <Input
                  placeholder="ago/2026 ou 2026-08"
                  value={novoMesAno}
                  onChange={e => setNovoMesAno(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">IPCA</label>
                <Input
                  placeholder="105.800000"
                  value={novoIpca}
                  onChange={e => setNovoIpca(e.target.value)}
                  className="w-36"
                  type="number"
                  step="0.000001"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Selic</label>
                <Input
                  placeholder="56.50"
                  value={novoSelic}
                  onChange={e => setNovoSelic(e.target.value)}
                  className="w-32"
                  type="number"
                  step="0.01"
                />
              </div>
              <Button onClick={addNovo} disabled={upsertMut.isPending} className="gap-2">
                <Check className="w-4 h-4" />
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setMostrarNovo(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtro por ano + botão de ordenação */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground">Filtrar por ano:</span>
        <Select value={filtroAno} onValueChange={handleFiltroAno}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {anos.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{indicesFiltrados.length} registros</Badge>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 ml-auto"
          onClick={() => setOrdemDesc(v => !v)}
          title={ordemDesc ? "Mais recentes primeiro — clique para inverter" : "Mais antigos primeiro — clique para inverter"}
        >
          {ordemDesc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
          {ordemDesc ? "Mais recentes primeiro" : "Mais antigos primeiro"}
        </Button>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando índices...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mês/Ano</th>
                    <th className="text-right px-4 py-3 font-medium text-blue-600 dark:text-blue-400">IPCA</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-600 dark:text-emerald-400">Selic</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground w-28">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {indicesOrdenados.map((ind, idx) => {
                    const isEdit = editing?.id === ind.id;
                    const isLast = ind.mesAno === ultimoIndice?.mesAno;
                    return (
                      <tr key={ind.id} className={`border-b last:border-0 transition-colors ${isLast ? "bg-primary/5" : idx % 2 === 0 ? "" : "bg-muted/20"} hover:bg-muted/30`}>
                        <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                          {ind.dataTexto}
                          {isLast && <Badge variant="outline" className="text-xs py-0 h-5 border-primary/40 text-primary">último</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEdit ? (
                            <Input
                              value={editing.ipca}
                              onChange={e => setEditing(prev => prev ? { ...prev, ipca: e.target.value } : null)}
                              className="w-32 ml-auto text-right h-7 text-xs"
                              type="number"
                              step="0.000001"
                            />
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400 font-mono">{parseFloat(ind.ipca).toFixed(6)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEdit ? (
                            <Input
                              value={editing.selic}
                              onChange={e => setEditing(prev => prev ? { ...prev, selic: e.target.value } : null)}
                              className="w-24 ml-auto text-right h-7 text-xs"
                              type="number"
                              step="0.01"
                            />
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-mono">{parseFloat(ind.selic).toFixed(2)}%</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEdit ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveEdit} disabled={updateMut.isPending}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm(`Excluir o índice "${ind.dataTexto}"? Esta ação não pode ser desfeita.`)) {
                                    deleteMut.mutate({ id: ind.id });
                                  }
                                }}
                                disabled={deleteMut.isPending}
                                title="Excluir índice"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-50 hover:opacity-100" onClick={() => startEdit(ind)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
