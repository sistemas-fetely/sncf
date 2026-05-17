import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Briefcase, Plus, Search, MoreHorizontal, Eye, Edit, Trash2,
  FileCheck, FileClock, User, ShieldAlert,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useParametros } from "@/hooks/useParametros";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { useCargos } from "@/hooks/useCargos";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { SalarioMasked } from "@/components/SalarioMasked";

const statusMap: Record<string, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  renovado: "Renovado",
};

const statusStyles: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground border-0",
  ativo: "bg-success/10 text-success border-0",
  suspenso: "bg-warning/10 text-warning border-0",
  encerrado: "bg-destructive/10 text-destructive border-0",
  renovado: "bg-info/10 text-info border-0",
};

interface ContratoPJ {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_municipal: string | null;
  inscricao_estadual: string | null;
  contato_nome: string;
  contato_telefone: string | null;
  contato_email: string | null;
  objeto: string | null;
  tipo_servico: string;
  departamento: string;
  departamento_id: string | null;
  valor_mensal: number;
  forma_pagamento: string;
  dia_vencimento: number | null;
  data_inicio: string;
  data_fim: string | null;
  renovacao_automatica: boolean;
  banco_nome: string | null;
  banco_codigo: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  chave_pix: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  foto_url: string | null;
  user_id: string | null;
  contrato_assinado?: boolean;
}

function ContratoPJForm({
  open, onClose, contrato, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contrato: ContratoPJ | null;
  onSaved: () => void;
}) {
  const { data: cargosRaw, isLoading: loadingCargos } = useCargos("pj");
  const cargos = (cargosRaw || []).map((c) => ({ id: c.id, label: c.nome }));
  const { data: formasPagamento, isLoading: loadingFormas } = useParametros("forma_pagamento");

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cnpj: contrato?.cnpj || "",
    razao_social: contrato?.razao_social || "",
    nome_fantasia: contrato?.nome_fantasia || "",
    inscricao_municipal: contrato?.inscricao_municipal || "",
    inscricao_estadual: contrato?.inscricao_estadual || "",
    contato_nome: contrato?.contato_nome || "",
    contato_telefone: contrato?.contato_telefone || "",
    contato_email: contrato?.contato_email || "",
    objeto: contrato?.objeto || "",
    tipo_servico: contrato?.tipo_servico || "",
    departamento: contrato?.departamento || "",
    departamento_id: contrato?.departamento_id || null,
    valor_mensal: contrato?.valor_mensal?.toString() || "",
    forma_pagamento: contrato?.forma_pagamento || "transferencia",
    dia_vencimento: contrato?.dia_vencimento?.toString() || "10",
    data_inicio: contrato?.data_inicio || "",
    data_fim: contrato?.data_fim || "",
    renovacao_automatica: contrato?.renovacao_automatica || false,
    banco_nome: contrato?.banco_nome || "",
    banco_codigo: contrato?.banco_codigo || "",
    agencia: contrato?.agencia || "",
    conta: contrato?.conta || "",
    tipo_conta: contrato?.tipo_conta || "corrente",
    chave_pix: contrato?.chave_pix || "",
    observacoes: contrato?.observacoes || "",
    status: contrato?.status || "rascunho",
  });

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.cnpj.trim()) { toast.error("CNPJ é obrigatório"); return; }
    if (!form.razao_social.trim()) { toast.error("Razão Social é obrigatória"); return; }
    if (!form.contato_nome.trim()) { toast.error("Nome do contato é obrigatório"); return; }
    if (!form.tipo_servico) { toast.error("Cargo é obrigatório"); return; }
    if (!form.departamento) { toast.error("Departamento é obrigatório"); return; }
    if (!form.valor_mensal) { toast.error("Valor mensal é obrigatório"); return; }
    if (!form.data_inicio) { toast.error("Data de início é obrigatória"); return; }

    setSaving(true);
    const payload = {
      cnpj: form.cnpj.trim(),
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia.trim() || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      contato_nome: form.contato_nome.trim(),
      contato_telefone: form.contato_telefone.trim() || null,
      contato_email: form.contato_email.trim() || null,
      objeto: form.objeto.trim() || null,
      tipo_servico: form.tipo_servico,
      departamento: form.departamento,
      departamento_id: form.departamento_id,
      valor_mensal: Number(form.valor_mensal),
      forma_pagamento: form.forma_pagamento,
      dia_vencimento: Number(form.dia_vencimento) || 10,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      renovacao_automatica: form.renovacao_automatica,
      banco_nome: form.banco_nome.trim() || null,
      banco_codigo: form.banco_codigo.trim() || null,
      agencia: form.agencia.trim() || null,
      conta: form.conta.trim() || null,
      tipo_conta: form.tipo_conta || null,
      chave_pix: form.chave_pix.trim() || null,
      observacoes: form.observacoes.trim() || null,
      status: form.status,
    };

    try {
      if (contrato) {
        const { error } = await supabase.from("contratos_pj").update(payload as any).eq("id", contrato.id);
        if (error) throw error;
        toast.success("Contrato atualizado!");
      } else {
        const { error } = await supabase.from("contratos_pj").insert(payload as any);
        if (error) throw error;
        toast.success("Contrato cadastrado!");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contrato ? "Editar Contrato PJ" : "Novo Contrato PJ"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Dados da Empresa */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">DADOS DA EMPRESA</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>CNPJ *</Label>
                <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <Label>Razão Social *</Label>
                <Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} />
              </div>
              <div>
                <Label>Inscrição Municipal</Label>
                <Input value={form.inscricao_municipal} onChange={(e) => set("inscricao_municipal", e.target.value)} />
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTATO</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Nome do Responsável *</Label>
                <Input value={form.contato_nome} onChange={(e) => set("contato_nome", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.contato_telefone} onChange={(e) => set("contato_telefone", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.contato_email} onChange={(e) => set("contato_email", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Contrato */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTRATO</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Cargo *</Label>
                {loadingCargos ? <Loader2 className="h-4 w-4 animate-spin mt-2" /> : (
                  <Select value={form.tipo_servico} onValueChange={(v) => set("tipo_servico", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(cargos || []).map((t) => (
                        <SelectItem key={t.id} value={t.label}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Departamento *</Label>
                <SelectDepartamentoHierarquico
                  valueId={form.departamento_id}
                  valueTexto={form.departamento}
                  onChange={(dep) => {
                    set("departamento_id", dep?.id || null);
                    set("departamento", dep?.label || "");
                  }}
                />
              </div>
              <div>
                <Label>Valor Mensal (R$) *</Label>
                <Input type="number" step="0.01" value={form.valor_mensal} onChange={(e) => set("valor_mensal", e.target.value)} />
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                {loadingFormas ? <Loader2 className="h-4 w-4 animate-spin mt-2" /> : (
                  <Select value={form.forma_pagamento} onValueChange={(v) => set("forma_pagamento", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(formasPagamento || []).map((f) => (
                        <SelectItem key={f.id} value={f.valor}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Dia do Vencimento</Label>
                <Input type="number" min="1" max="31" value={form.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusMap).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Vigência */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">VIGÊNCIA</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Data de Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} />
              </div>
              <div>
                <Label>Data de Fim</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.renovacao_automatica} onCheckedChange={(v) => set("renovacao_automatica", v)} />
                <Label className="cursor-pointer">Renovação automática</Label>
              </div>
            </div>
          </div>

          {/* Dados Bancários */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">DADOS BANCÁRIOS DO PRESTADOR</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Banco</Label>
                <Input value={form.banco_nome} onChange={(e) => set("banco_nome", e.target.value)} />
              </div>
              <div>
                <Label>Código Banco</Label>
                <Input value={form.banco_codigo} onChange={(e) => set("banco_codigo", e.target.value)} />
              </div>
              <div>
                <Label>Agência</Label>
                <Input value={form.agencia} onChange={(e) => set("agencia", e.target.value)} />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={form.conta} onChange={(e) => set("conta", e.target.value)} />
              </div>
              <div>
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo_conta} onValueChange={(v) => set("tipo_conta", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Chave PIX</Label>
                <Input value={form.chave_pix} onChange={(e) => set("chave_pix", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Objeto e Observações */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">DETALHES</h3>
            <div className="space-y-4">
              <div>
                <Label>Objeto do Contrato</Label>
                <Textarea value={form.objeto} onChange={(e) => set("objeto", e.target.value)} placeholder="Descrição do escopo dos serviços..." rows={3} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContratosPJ() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isSuperAdmin, isAdminRH } = usePermissions();
  const canCreate = hasPermission("contratos_pj", "create");
  const canEdit = hasPermission("contratos_pj", "edit");
  const canDelete = hasPermission("contratos_pj", "delete");
  const [contratos, setContratos] = useState<ContratoPJ[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [formOpen, setFormOpen] = useState(searchParams.get("novo") === "true");
  const [editContrato, setEditContrato] = useState<ContratoPJ | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContratoPJ | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContratos = async () => {
    const { data } = await supabase
      .from("contratos_pj")
      .select("*")
      .order("razao_social");
    setContratos((data as ContratoPJ[]) || []);
    setLoading(false);

    // Handle edit param from detail page
    const editId = searchParams.get("edit");
    if (editId && data) {
      const target = (data as ContratoPJ[]).find((c) => c.id === editId);
      if (target) { setEditContrato(target); setFormOpen(true); }
      setSearchParams({}, { replace: true });
    }
  };

  useEffect(() => { fetchContratos(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const id = deleteTarget.id;
      // Delete dependent records first (foreign key constraints)
      await supabase.from("contrato_pj_acessos_sistemas").delete().eq("contrato_pj_id", id);
      await supabase.from("contrato_pj_equipamentos").delete().eq("contrato_pj_id", id);
      await supabase.from("ferias_pj").delete().eq("contrato_id", id);
      await supabase.from("ferias_periodos_pj").delete().eq("contrato_id", id);
      await supabase.from("pagamentos_pj").delete().eq("contrato_id", id);
      await supabase.from("notas_fiscais_pj").delete().eq("contrato_id", id);
      await supabase.from("movimentacoes").delete().eq("contrato_pj_id", id);
      await supabase.from("posicoes").update({ contrato_pj_id: null, status: "vaga_aberta" }).eq("contrato_pj_id", id);

      const { error } = await supabase.from("contratos_pj").delete().eq("id", id);
      if (error) throw error;
      toast.success("Contrato excluído");
      setContratos((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir contrato");
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const [viewContrato, setViewContrato] = useState<ContratoPJ | null>(null);

  const openNew = () => { setEditContrato(null); setFormOpen(true); };
  const openEdit = (c: ContratoPJ) => { setEditContrato(c); setFormOpen(true); };

  const totalAtivos = contratos.filter((c) => c.status === "ativo").length;
  const totalValor = contratos
    .filter((c) => c.status === "ativo")
    .reduce((sum, c) => sum + Number(c.valor_mensal), 0);

  const filtered = contratos.filter((c) => {
    const matchSearch =
      c.razao_social.toLowerCase().includes(search.toLowerCase()) ||
      (c.nome_fantasia || "").toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj.includes(search) ||
      c.contato_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos PJ</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de contratos de prestadores de serviço</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => navigate("/contratos-pj/novo")}>
              <Plus className="h-4 w-4" /> Novo Contrato
            </Button>
            {(isSuperAdmin || isAdminRH) && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/contratos-pj/novo-manual")}
                title="Formulário único para casos emergenciais"
              >
                <ShieldAlert className="h-4 w-4" /> Manual
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{contratos.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAtivos}</p>
              <p className="text-xs text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
              <FileClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Valor mensal ativo</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por empresa, CNPJ ou contato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(statusMap).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Empresa</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="font-semibold">Serviço</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Departamento</TableHead>
                  <TableHead className="font-semibold">Valor Mensal</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Contrato</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Vigência</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum contrato encontrado.</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/contratos-pj/${c.id}`, { state: { from: "/contratos-pj" } })}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={c.foto_url || undefined} alt={c.contato_nome} className="object-cover" />
                            <AvatarFallback className="bg-muted text-foreground text-xs">
                              {c.contato_nome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{c.nome_fantasia || c.razao_social}</p>
                            {c.nome_fantasia && (
                              <p className="text-xs text-muted-foreground">{c.razao_social}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell font-mono">{c.cnpj}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-muted text-foreground border-0">{c.tipo_servico}</Badge>
                      </TableCell>
                      <TableCell className="text-sm hidden lg:table-cell">{c.departamento}</TableCell>
                      <TableCell className="text-sm font-medium">
                        <SalarioMasked
                          valor={Number(c.valor_mensal)}
                          userId={c.user_id}
                          contexto="admissao"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[c.status] || ""}>
                          {statusMap[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className={(c as any).contrato_assinado ? "bg-success/10 text-success border-0" : "bg-warning/10 text-warning border-0"}>
                          {(c as any).contrato_assinado ? "Assinado" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                        {format(parseISO(c.data_inicio), "dd/MM/yyyy")}
                        {c.data_fim && ` — ${format(parseISO(c.data_fim), "dd/MM/yyyy")}`}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewContrato(c)}>
                              <Eye className="mr-2 h-4 w-4" /> Visualizar
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => openEdit(c)}>
                                <Edit className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(c)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-muted-foreground">
              Mostrando {filtered.length} de {contratos.length} contratos
            </p>
          </div>
        </CardContent>
      </Card>

      {formOpen && (
        <ContratoPJForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          contrato={editContrato}
          onSaved={fetchContratos}
        />
      )}

      {/* View Detail Dialog */}
      <Dialog open={!!viewContrato} onOpenChange={(open) => !open && setViewContrato(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewContrato?.nome_fantasia || viewContrato?.razao_social}</DialogTitle>
          </DialogHeader>
          {viewContrato && (
            <div className="space-y-6 py-2">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">DADOS DA EMPRESA</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">CNPJ</p><p className="text-sm font-medium">{viewContrato.cnpj}</p></div>
                  <div><p className="text-xs text-muted-foreground">Razão Social</p><p className="text-sm font-medium">{viewContrato.razao_social}</p></div>
                  {viewContrato.nome_fantasia && <div><p className="text-xs text-muted-foreground">Nome Fantasia</p><p className="text-sm font-medium">{viewContrato.nome_fantasia}</p></div>}
                  {viewContrato.inscricao_municipal && <div><p className="text-xs text-muted-foreground">Inscrição Municipal</p><p className="text-sm font-medium">{viewContrato.inscricao_municipal}</p></div>}
                  {viewContrato.inscricao_estadual && <div><p className="text-xs text-muted-foreground">Inscrição Estadual</p><p className="text-sm font-medium">{viewContrato.inscricao_estadual}</p></div>}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTATO</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><p className="text-xs text-muted-foreground">Responsável</p><p className="text-sm font-medium">{viewContrato.contato_nome}</p></div>
                  {viewContrato.contato_telefone && <div><p className="text-xs text-muted-foreground">Telefone</p><p className="text-sm font-medium">{viewContrato.contato_telefone}</p></div>}
                  {viewContrato.contato_email && <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium">{viewContrato.contato_email}</p></div>}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTRATO</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><p className="text-xs text-muted-foreground">Cargo</p><p className="text-sm font-medium">{viewContrato.tipo_servico}</p></div>
                  <div><p className="text-xs text-muted-foreground">Departamento</p><p className="text-sm font-medium">{viewContrato.departamento}</p></div>
                  <div><p className="text-xs text-muted-foreground">Valor Mensal</p><p className="text-sm font-medium"><SalarioMasked valor={Number(viewContrato.valor_mensal)} userId={viewContrato.user_id} contexto="admissao" /></p></div>
                  <div><p className="text-xs text-muted-foreground">Forma de Pagamento</p><p className="text-sm font-medium">{viewContrato.forma_pagamento}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dia Vencimento</p><p className="text-sm font-medium">{viewContrato.dia_vencimento}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={statusStyles[viewContrato.status] || ""}>{statusMap[viewContrato.status] || viewContrato.status}</Badge></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">VIGÊNCIA</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><p className="text-xs text-muted-foreground">Início</p><p className="text-sm font-medium">{format(parseISO(viewContrato.data_inicio), "dd/MM/yyyy")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fim</p><p className="text-sm font-medium">{viewContrato.data_fim ? format(parseISO(viewContrato.data_fim), "dd/MM/yyyy") : "Indeterminado"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Renovação Automática</p><p className="text-sm font-medium">{viewContrato.renovacao_automatica ? "Sim" : "Não"}</p></div>
                </div>
              </div>

              {(viewContrato.banco_nome || viewContrato.chave_pix) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">DADOS BANCÁRIOS</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {viewContrato.banco_nome && <div><p className="text-xs text-muted-foreground">Banco</p><p className="text-sm font-medium">{viewContrato.banco_nome} {viewContrato.banco_codigo && `(${viewContrato.banco_codigo})`}</p></div>}
                    {viewContrato.agencia && <div><p className="text-xs text-muted-foreground">Agência</p><p className="text-sm font-medium">{viewContrato.agencia}</p></div>}
                    {viewContrato.conta && <div><p className="text-xs text-muted-foreground">Conta</p><p className="text-sm font-medium">{viewContrato.conta} ({viewContrato.tipo_conta})</p></div>}
                    {viewContrato.chave_pix && <div><p className="text-xs text-muted-foreground">Chave PIX</p><p className="text-sm font-medium">{viewContrato.chave_pix}</p></div>}
                  </div>
                </div>
              )}

              {(viewContrato.objeto || viewContrato.observacoes) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">DETALHES</h3>
                  {viewContrato.objeto && <div className="mb-2"><p className="text-xs text-muted-foreground">Objeto do Contrato</p><p className="text-sm">{viewContrato.objeto}</p></div>}
                  {viewContrato.observacoes && <div><p className="text-xs text-muted-foreground">Observações</p><p className="text-sm">{viewContrato.observacoes}</p></div>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewContrato(null)}>Fechar</Button>
            {canEdit && (
              <Button onClick={() => { if (viewContrato) { openEdit(viewContrato); setViewContrato(null); } }}>
                <Edit className="mr-2 h-4 w-4" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato de <strong>{deleteTarget?.razao_social}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
