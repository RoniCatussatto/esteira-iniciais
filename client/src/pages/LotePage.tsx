import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Pencil, FileSpreadsheet, User, Car, MapPin, Loader2, CheckCircle, Clock } from "lucide-react";

type Devedor = {
  id: number;
  loteId: number;
  cooperativa: string | null;
  dataBordero: string | null;
  contratos: string | null;
  valorBordero: string | null;
  contrarioNome: string | null;
  contrarioCpf: string | null;
  vencBordero: string | null;
  contrarioEndereco: string | null;
  foro: string | null;
  veiculoModelo: string | null;
  veiculoAno: string | null;
  veiculoPlaca: string | null;
  veiculoRenavam: string | null;
  veiculoChassis: string | null;
  tipoInicial: string | null;
  tipoPlanilha: string | null;
  valorCausa: string | null;
  status: string;
  observacoes: string | null;
};

export default function LotePage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const loteId = parseInt(params.id ?? "0");

  const { data: lote, isLoading: loadingLote } = trpc.lotes.getById.useQuery({ id: loteId });
  const { data: devedores, isLoading: loadingDevedores, refetch } = trpc.lotes.getDevedores.useQuery({ loteId });

  const [editingDevedor, setEditingDevedor] = useState<Devedor | null>(null);
  const [editForm, setEditForm] = useState<Partial<Devedor>>({});
  const [saving, setSaving] = useState(false);

  const updateMutation = trpc.devedores.update.useMutation({
    onSuccess: () => {
      toast.success("Dados salvos com sucesso!");
      setEditingDevedor(null);
      refetch();
    },
    onError: (err) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  function openEdit(devedor: Devedor) {
    setEditingDevedor(devedor);
    setEditForm({ ...devedor });
  }

  function handleSave() {
    if (!editingDevedor) return;
    updateMutation.mutate({
      id: editingDevedor.id,
      contrarioNome: editForm.contrarioNome ?? undefined,
      contrarioCpf: editForm.contrarioCpf ?? undefined,
      contrarioEndereco: editForm.contrarioEndereco ?? undefined,
      foro: editForm.foro ?? undefined,
      contratos: editForm.contratos ?? undefined,
      valorBordero: editForm.valorBordero ?? undefined,
      vencBordero: editForm.vencBordero ?? undefined,
      veiculoModelo: editForm.veiculoModelo ?? null,
      veiculoAno: editForm.veiculoAno ?? null,
      veiculoPlaca: editForm.veiculoPlaca ?? null,
      veiculoRenavam: editForm.veiculoRenavam ?? null,
      veiculoChassis: editForm.veiculoChassis ?? null,
      observacoes: editForm.observacoes ?? null,
    });
  }

  function field(label: string, value: string | null | undefined) {
    return (
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-sm text-gray-900 font-medium truncate">{value ?? <span className="text-gray-400 italic">—</span>}</p>
      </div>
    );
  }

  if (loadingLote || loadingDevedores) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{lote.nome}</h1>
            <p className="text-sm text-gray-500">{lote.totalDevedores} devedor(es) · Borderô: {lote.dataBordero ?? "—"}</p>
          </div>
          <Badge variant={lote.status === "concluido" ? "outline" : lote.status === "erro" ? "destructive" : "secondary"}>
            {lote.status === "aguardando" ? "Aguardando" : lote.status === "em_processamento" ? "Em processamento" : lote.status === "concluido" ? "Concluído" : "Erro"}
          </Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Cooperativa", value: lote.cooperativa ?? "—" },
            { label: "Data do Borderô", value: lote.dataBordero ?? "—" },
            { label: "Total de Devedores", value: String(lote.totalDevedores) },
            { label: "Importado em", value: new Date(lote.createdAt).toLocaleDateString("pt-BR") },
          ].map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</p>
              <p className="text-base font-semibold text-gray-900 mt-1">{item.value}</p>
            </Card>
          ))}
        </div>

        {/* Lista de Devedores */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Devedores do Lote</CardTitle>
            <CardDescription>
              Revise os dados extraídos. Clique em "Editar" para corrigir qualquer informação antes de prosseguir.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!devedores || devedores.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Nenhum devedor encontrado.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {devedores.map((dev, idx) => (
                  <div key={dev.id} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-900">{dev.contrarioNome ?? "—"}</p>
                          <p className="text-sm text-gray-500">CPF: {dev.contrarioCpf ?? "—"}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => openEdit(dev as Devedor)}>
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                      {field("Contratos", dev.contratos)}
                      {field("Valor do Borderô", dev.valorBordero)}
                      {field("Vencimento", dev.vencBordero)}
                      {field("Foro", dev.foro)}
                      {field("Endereço", dev.contrarioEndereco)}
                      {dev.veiculoModelo && field("Veículo", dev.veiculoModelo)}
                      {dev.veiculoPlaca && field("Placa", dev.veiculoPlaca)}
                      {dev.veiculoAno && field("Ano", dev.veiculoAno)}
                      {dev.veiculoRenavam && field("Renavam", dev.veiculoRenavam)}
                      {dev.veiculoChassis && field("Chassi", dev.veiculoChassis)}
                    </div>

                    {dev.observacoes && (
                      <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">{dev.observacoes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog de Edição */}
      <Dialog open={!!editingDevedor} onOpenChange={(open) => !open && setEditingDevedor(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Devedor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {[
              { key: "contrarioNome", label: "Nome do Devedor" },
              { key: "contrarioCpf", label: "CPF" },
              { key: "contratos", label: "Contratos" },
              { key: "valorBordero", label: "Valor do Borderô" },
              { key: "vencBordero", label: "Vencimento do Borderô" },
              { key: "foro", label: "Foro" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-xs text-gray-600 mb-1">{label}</Label>
                <Input
                  value={(editForm as Record<string, string | null>)[key] ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <Label className="text-xs text-gray-600 mb-1">Endereço</Label>
              <Input
                value={editForm.contrarioEndereco ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, contrarioEndereco: e.target.value }))}
              />
            </div>
            <Separator className="md:col-span-2" />
            <p className="md:col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dados do Veículo (opcional)</p>
            {[
              { key: "veiculoModelo", label: "Modelo" },
              { key: "veiculoAno", label: "Ano" },
              { key: "veiculoPlaca", label: "Placa" },
              { key: "veiculoRenavam", label: "Renavam" },
              { key: "veiculoChassis", label: "Chassi" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-xs text-gray-600 mb-1">{label}</Label>
                <Input
                  value={(editForm as Record<string, string | null>)[key] ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value || null }))}
                  placeholder="Deixe vazio se não houver"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <Label className="text-xs text-gray-600 mb-1">Observações</Label>
              <Input
                value={editForm.observacoes ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value || null }))}
                placeholder="Observações internas (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDevedor(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
