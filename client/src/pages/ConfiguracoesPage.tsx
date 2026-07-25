import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  FileText,
  ArrowLeft,
  Search,
} from "lucide-react";
import { Link } from "wouter";

type Cliente = {
  id: number;
  nomeFantasia: string;
  nomeCompleto: string | null;
  doc: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  cep: string | null;
  uf: string | null;
  municipio: string | null;
  paragrafaInicial: string | null;
  enderecoCoop: string | null;
};

type DocConfig = {
  id: number;
  clienteId: number;
  nomeDocumento: string;
  descricao: string | null;
  configJson: string | null;
  ativo: number;
};

const EMPTY_CLIENTE: Omit<Cliente, "id"> = {
  nomeFantasia: "",
  nomeCompleto: null,
  doc: null,
  telefone: null,
  logradouro: null,
  numero: null,
  complemento: null,
  cep: null,
  uf: null,
  municipio: null,
  paragrafaInicial: null,
  enderecoCoop: null,
};

function ClienteForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial: Omit<Cliente, "id">;
  onSave: (data: Omit<Cliente, "id">) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v || null }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Nome Fantasia *</label>
          <Input
            value={form.nomeFantasia}
            onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value }))}
            placeholder="Ex: SICOOB COOPEREMB"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Nome Completo</label>
          <Input
            value={form.nomeCompleto ?? ""}
            onChange={(e) => set("nomeCompleto", e.target.value)}
            placeholder="Razão social completa"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">CNPJ</label>
          <Input
            value={form.doc ?? ""}
            onChange={(e) => set("doc", e.target.value)}
            placeholder="00.000.000/0001-00"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Telefone</label>
          <Input
            value={form.telefone ?? ""}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(00) 0000-0000"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Logradouro</label>
          <Input
            value={form.logradouro ?? ""}
            onChange={(e) => set("logradouro", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Número</label>
          <Input
            value={form.numero ?? ""}
            onChange={(e) => set("numero", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Complemento</label>
          <Input
            value={form.complemento ?? ""}
            onChange={(e) => set("complemento", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">CEP</label>
          <Input
            value={form.cep ?? ""}
            onChange={(e) => set("cep", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Município</label>
          <Input
            value={form.municipio ?? ""}
            onChange={(e) => set("municipio", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">UF</label>
          <Input
            value={form.uf ?? ""}
            onChange={(e) => set("uf", e.target.value)}
            maxLength={2}
            placeholder="SP"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Endereço Formatado</label>
          <Input
            value={form.enderecoCoop ?? ""}
            onChange={(e) => set("enderecoCoop", e.target.value)}
            placeholder="Endereço completo formatado para uso nas petições"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Parágrafo Inicial</label>
          <Textarea
            value={form.paragrafaInicial ?? ""}
            onChange={(e) => set("paragrafaInicial", e.target.value)}
            rows={4}
            placeholder="Texto descritivo da cliente para uso nas petições iniciais"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={loading || !form.nomeFantasia.trim()}
        >
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function ClienteCard({ cliente, onEdit, onDelete }: {
  cliente: Cliente;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const docsQuery = trpc.docConfigs.getByCliente.useQuery(
    { clienteId: cliente.id },
    { enabled: expanded }
  );
  const docs = docsQuery.data ?? [];

  const utils = trpc.useUtils();
  const deleteDoc = trpc.docConfigs.delete.useMutation({
    onSuccess: () => {
      utils.docConfigs.getByCliente.invalidate({ clienteId: cliente.id });
      toast.success("Documento removido");
    },
  });

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header da linha */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-gray-900">{cliente.nomeFantasia}</span>
          {cliente.municipio && cliente.uf && (
            <span className="text-xs text-gray-400 ml-2">{cliente.municipio}/{cliente.uf}</span>
          )}
          {cliente.doc && (
            <span className="text-xs text-gray-400 ml-2">· CNPJ: {cliente.doc}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso removerá permanentemente <strong>{cliente.nomeFantasia}</strong> e todas as suas configurações de documentos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={onDelete}>
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
          {/* Dados da cliente */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dados Cadastrais</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {cliente.nomeCompleto && (
                <div className="col-span-2">
                  <span className="text-gray-500">Nome completo: </span>
                  <span className="text-gray-800">{cliente.nomeCompleto}</span>
                </div>
              )}
              {cliente.doc && (
                <div><span className="text-gray-500">CNPJ: </span><span className="text-gray-800">{cliente.doc}</span></div>
              )}
              {cliente.telefone && (
                <div><span className="text-gray-500">Tel: </span><span className="text-gray-800">{cliente.telefone}</span></div>
              )}
              {cliente.enderecoCoop && (
                <div className="col-span-2"><span className="text-gray-500">Endereço: </span><span className="text-gray-800">{cliente.enderecoCoop}</span></div>
              )}
              {cliente.paragrafaInicial && (
                <div className="col-span-2 mt-1">
                  <p className="text-gray-500 text-xs mb-0.5">Parágrafo inicial:</p>
                  <p className="text-gray-700 text-xs italic leading-relaxed">{cliente.paragrafaInicial}</p>
                </div>
              )}
            </div>
          </div>

          {/* Documentos configurados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Documentos Configurados
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => toast.info("Em breve: configuração de novo documento")}
              >
                <Plus className="w-3 h-3 mr-1" />
                Configurar novo documento
              </Button>
            </div>

            {docsQuery.isLoading ? (
              <p className="text-xs text-gray-400">Carregando...</p>
            ) : docs.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <FileText className="w-4 h-4" />
                <span>Nenhum documento configurado ainda para esta cliente.</span>
              </div>
            ) : (
              <div className="space-y-1">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 py-1.5 px-2 bg-white rounded border border-gray-200">
                    <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-sm text-gray-800 flex-1">{doc.nomeDocumento}</span>
                    {doc.descricao && (
                      <span className="text-xs text-gray-400">{doc.descricao}</span>
                    )}
                    <Badge variant={doc.ativo ? "default" : "secondary"} className="text-xs">
                      {doc.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover configuração?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Remove a configuração de extração do documento <strong>{doc.nomeDocumento}</strong>.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                            onClick={() => deleteDoc.mutate({ id: doc.id })}
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
        </div>
      )}
    </div>
  );
}

export default function ConfiguracoesPage() {
  const utils = trpc.useUtils();
  const { data: clientes = [], isLoading } = trpc.clientes.list.useQuery();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [saving, setSaving] = useState(false);

  const createMutation = trpc.clientes.create.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      setDialogOpen(false);
      toast.success("Cliente cadastrada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
    onSettled: () => setSaving(false),
  });

  const updateMutation = trpc.clientes.update.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      setDialogOpen(false);
      setEditingCliente(null);
      toast.success("Cliente atualizada!");
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
    onSettled: () => setSaving(false),
  });

  const deleteMutation = trpc.clientes.delete.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      toast.success("Cliente excluída.");
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const filtered = clientes.filter((c) =>
    c.nomeFantasia.toLowerCase().includes(search.toLowerCase()) ||
    (c.nomeCompleto ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.municipio ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = (data: Omit<Cliente, "id">) => {
    setSaving(true);
    if (editingCliente) {
      updateMutation.mutate({ id: editingCliente.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openNew = () => {
    setEditingCliente(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setEditingCliente(c);
    setDialogOpen(true);
  };

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
            <Building2 className="w-5 h-5 text-blue-600" />
            Configurações — Clientes
          </h1>
          <p className="text-sm text-gray-500">
            Gerencie as clientes cadastradas e as configurações de extração de documentos de cada uma.
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nova Cliente
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Barra de busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome fantasia, nome completo ou município..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Contador */}
        <p className="text-sm text-gray-500">
          {isLoading ? "Carregando..." : `${filtered.length} cliente(s) encontrada(s)`}
        </p>

        {/* Lista */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma cliente encontrada.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <ClienteCard
                key={c.id}
                cliente={c as Cliente}
                onEdit={() => openEdit(c as Cliente)}
                onDelete={() => deleteMutation.mutate({ id: c.id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog de criação/edição */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCliente(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCliente ? `Editar: ${editingCliente.nomeFantasia}` : "Nova Cliente"}
            </DialogTitle>
          </DialogHeader>
          <ClienteForm
            initial={editingCliente ? {
              nomeFantasia: editingCliente.nomeFantasia,
              nomeCompleto: editingCliente.nomeCompleto,
              doc: editingCliente.doc,
              telefone: editingCliente.telefone,
              logradouro: editingCliente.logradouro,
              numero: editingCliente.numero,
              complemento: editingCliente.complemento,
              cep: editingCliente.cep,
              uf: editingCliente.uf,
              municipio: editingCliente.municipio,
              paragrafaInicial: editingCliente.paragrafaInicial,
              enderecoCoop: editingCliente.enderecoCoop,
            } : EMPTY_CLIENTE}
            onSave={handleSave}
            onCancel={() => { setDialogOpen(false); setEditingCliente(null); }}
            loading={saving}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
