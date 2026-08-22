import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useParametros } from "@/hooks/useParametros";
import {
  FileText, Search, MoreHorizontal, Eye, Edit, Trash2, Plus, Loader2,
  Calendar, Filter, TrendingUp, Clock, CheckCircle2, AlertTriangle, DollarSign, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfQuarter, endOfQuarter, isWithinInterval } from "date-fns";
import { ptBR as dateFnsPtBR } from "date-fns/locale";
import ImportNFDialog from "@/components/notas-fiscais/ImportNFDialog";
import { useAuth } from "@/contexts/AuthContext";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const periodOptions: { value: string; label: string }[] = [
  { value: "todos", label: "Todo Período" },
  { value: "mes_atual", label: "Mês Atual" },
  { value: "mes_anterior", label: "Mês Anterior" },
  { value: "trimestre_atual", label: "Trimestre Atual" },
  { value: "ano_atual", label: "Ano Atual" },
  { value: "ultimos_3_meses", label: "Últimos 3 Meses" },
  { value: "ultimos_6_meses", label: "Últimos 6 Meses" },
  { value: "ultimos_12_meses", label: "Últimos 12 Meses" },
];

function getPeriodRange(period: string): { start: Date; end: Date } | null {
  const now = new Date();
  switch (period) {
    case "mes_atual": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "mes_anterior": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
    case "trimestre_atual": return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "ano_atual": return { start: startOfYear(now), end: endOfYear(now) };
    case "ultimos_3_meses": return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case "ultimos_6_meses": return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
    case "ultimos_12_meses": return { start: startOfMonth(subMonths(now, 11)), end: endOfMonth(now) };
    default: return null;
  }
}

const defaultStatusMap: Record<string, string> = {
  pendente: "Pendente", aprovada: "Aprovada", enviada_pagamento: "Enviada para Pagamento", paga: "Paga", cancelada: "Cancelada", vencida: "Vencida",
};
const statusStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
  aprovada: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  enviada_pagamento: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  paga: "bg-success/10 text-success border-0 min-w-[140px] justify-center",
  cancelada: "bg-destructive/10 text-destructive border-0 min-w-[140px] justify-center",
  vencida: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
};

interface NotaComContrato {
  id: string;
  numero: string;
  serie: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  competencia: string;
  descricao: string | null;
  arquivo_url: string | null;
  status: string;
  observacoes: string | null;
  contrato_id: string;
  contrato_nome: string;
  contrato_cnpj: string;
  pagamento_data_prevista: string | null;
  pagamento_forma: string | null;
}

interface ContratoPJOption {
  id: string;
  label: string;
  cnpj: string;
}

export default function NotasFiscais() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const hasPermission = (_m: string, _a?: string) => true;
  const canCreate = hasPermission("notas_fiscais", "create");
  const canEdit = hasPermission("notas_fiscais", "edit");
  const canDelete = hasPermission("notas_fiscais", "delete");
  const hasAnyAction = canEdit || canDelete;
  const { data: statusParams } = useParametros("status_nota_fiscal");
  const statusMap = useMemo(() => {
    if (statusParams && statusParams.length > 0) {
      return Object.fromEntries(statusParams.map((p) => [p.valor, p.label]));
    }
    return defaultStatusMap;
  }, [statusParams]);
  const [notas, setNotas] = useState<NotaComContrato[]>([]);
  const [contratos, setContratos] = useState<ContratoPJOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterContrato, setFilterContrato] = useState("todos");
  const [filterPeriodo, setFilterPeriodo] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editNota, setEditNota] = useState<NotaComContrato | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotaComContrato | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fetchData = async () => {
    const [{ data: nfs }, { data: cps }, { data: pags }] = await Promise.all([
      supabase.from("notas_fiscais_pj").select("*").order("data_emissao", { ascending: false }),
      supabase.from("contratos_pj").select("id, razao_social, nome_fantasia, cnpj").order("razao_social"),
      supabase.from("pagamentos_pj").select("nota_fiscal_id, data_prevista, forma_pagamento"),
    ]);

    const contratoMap = new Map((cps || []).map((c) => [c.id, c]));
    const pagMap = new Map((pags || []).map((p: any) => [p.nota_fiscal_id, p]));
    const mapped: NotaComContrato[] = (nfs || []).map((n: any) => {
      const c = contratoMap.get(n.contrato_id);
      const pag = pagMap.get(n.id);
      return {
        ...n,
        contrato_nome: nomeExibicao(c?.razao_social, c?.nome_fantasia, "—"),
        contrato_cnpj: c?.cnpj || "—",
        pagamento_data_prevista: pag?.data_prevista || null,
        pagamento_forma: pag?.forma_pagamento || null,
      };
    });
    setNotas(mapped);
    setContratos((cps || []).map((c) => ({ id: c.id, label: nomeExibicao(c.razao_social, c.nome_fantasia), cnpj: c.cnpj })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Handle ?edit=<id> query param from detail page
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && notas.length > 0) {
      const found = notas.find((n) => n.id === editId);
      if (found) {
        setEditNota(found);
        setFormOpen(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [notas, searchParams]);

  const filtered = notas.filter((n) => {
    const matchSearch =
      n.numero.toLowerCase().includes(search.toLowerCase()) ||
      n.contrato_nome.toLowerCase().includes(search.toLowerCase()) ||
      n.competencia.includes(search);
    const matchStatus = filterStatus === "todos" || n.status === filterStatus;
    const matchContrato = filterContrato === "todos" || n.contrato_id === filterContrato;
    const range = getPeriodRange(filterPeriodo);
    const matchPeriodo = !range || isWithinInterval(parseISO(n.data_emissao), { start: range.start, end: range.end });
    return matchSearch && matchStatus && matchContrato && matchPeriodo;
  });
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("notas_fiscais_pj").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Nota fiscal excluída"); fetchData(); }
    setDeleteTarget(null);
  };

  // Fixed: Mês Atual stats
  const now = new Date();
  const mesAtualRange = { start: startOfMonth(now), end: endOfMonth(now) };
  const notasMesAtual = notas.filter((n) => {
    try { return isWithinInterval(parseISO(n.data_emissao), mesAtualRange); } catch { return false; }
  });
  const mesAtualTotal = notasMesAtual.length;
  const mesAtualValor = notasMesAtual.reduce((acc, n) => acc + Number(n.valor), 0);
  const mesAtualPagas = notasMesAtual.filter((n) => n.status === "paga").reduce((acc, n) => acc + Number(n.valor), 0);
  const mesAtualPendente = notasMesAtual.filter((n) => ["pendente", "aprovada", "enviada_pagamento"].includes(n.status)).reduce((acc, n) => acc + Number(n.valor), 0);
  const nomeMesAtual = format(now, "MMMM yyyy", { locale: dateFnsPtBR });

  // Dynamic: filtered stats
  const filteredTotal = filtered.length;
  const filteredValor = filtered.reduce((acc, n) => acc + Number(n.valor), 0);
  const filteredPagas = filtered.filter((n) => n.status === "paga").length;
  const filteredPendentes = filtered.filter((n) => ["pendente", "aprovada", "enviada_pagamento"].includes(n.status)).length;
  const filteredValorPago = filtered.filter((n) => n.status === "paga").reduce((acc, n) => acc + Number(n.valor), 0);
  const filteredValorPendente = filtered.filter((n) => ["pendente", "aprovada", "enviada_pagamento"].includes(n.status)).reduce((acc, n) => acc + Number(n.valor), 0);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const hasActiveFilter = filterStatus !== "todos" || filterContrato !== "todos" || filterPeriodo !== "todos" || search.trim() !== "";

  return (
    <PageShell>
      <PageHeader
        titulo="Notas Fiscais"
        estado="Gestão de notas fiscais de todos os contratos PJ"
        acoes={canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Importar PDF
            </Button>
            <Button className="gap-2" onClick={() => { setEditNota(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Nova NF
            </Button>
          </div>
        )}
      />

      {/* Mês Atual - Fixed Cards */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-3.5 w-3.5 text-foreground" />
          <h2 className="text-xs font-medium text-foreground uppercase tracking-wide capitalize">{nomeMesAtual}</h2>
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-[3px] border-l-info bg-gradient-to-br from-info/5 to-transparent">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total NFs</p>
                  <p className="text-lg font-medium mt-0.5">{mesAtualTotal}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-info/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-info" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">R$ {fmtBRL(mesAtualValor)} total</p>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-success/40 bg-gradient-to-br from-success/5 to-transparent">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Pago</p>
                  <p className="text-lg font-medium mt-0.5 text-success">R$ {fmtBRL(mesAtualPagas)}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-warning/40 bg-gradient-to-br from-warning/5 to-transparent">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">A Pagar</p>
                  <p className="text-lg font-medium mt-0.5 text-warning">R$ {fmtBRL(mesAtualPendente)}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-destructive/40 bg-gradient-to-br from-destructive/5 to-transparent">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Vencidas</p>
                  <p className="text-lg font-medium mt-0.5 text-destructive">{notasMesAtual.filter((n) => n.status === "vencida").length}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtered Cards */}
      {hasActiveFilter && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Resultado dos Filtros</h2>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-info/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-info" />
                </div>
                <div>
                  <p className="text-xl font-medium">{filteredTotal}</p>
                  <p className="text-xs text-muted-foreground">Notas encontradas</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xl font-medium">R$ {fmtBRL(filteredValor)}</p>
                  <p className="text-xs text-muted-foreground">Valor total</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xl font-medium">{filteredPagas}</p>
                  <p className="text-xs text-muted-foreground">Pagas — R$ {fmtBRL(filteredValorPago)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xl font-medium">{filteredPendentes}</p>
                  <p className="text-xs text-muted-foreground">Pendentes — R$ {fmtBRL(filteredValorPendente)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por número, contrato ou competência..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterContrato} onValueChange={setFilterContrato}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Contrato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Contratos</SelectItem>
                {contratos.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(statusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Número</TableHead>
                  <TableHead className="font-medium">Contrato</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Competência</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Emissão</TableHead>
                  <TableHead className="font-medium">Valor</TableHead>
                  <TableHead className="font-medium hidden lg:table-cell">Vencimento</TableHead>
                  <TableHead className="font-medium hidden lg:table-cell">Forma Pgto</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  {hasAnyAction && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma nota fiscal encontrada.</TableCell></TableRow>
                ) : filtered.map((n) => (
                  <TableRow key={n.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/notas-fiscais/${n.id}`, { state: { from: "/notas-fiscais", fromLabel: "Notas Fiscais" } })}>
                    <TableCell className="font-medium">{n.numero}{n.serie ? `/${n.serie}` : ""}</TableCell>
                    <TableCell className="text-sm">{n.contrato_nome}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{n.competencia ? format(parseISO(n.competencia), "MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{format(parseISO(n.data_emissao), "dd/MM/yyyy")}</TableCell>
                    <TableCell>R$ {Number(n.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{n.data_vencimento ? format(parseISO(n.data_vencimento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell capitalize">{n.pagamento_forma || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={statusStyles[n.status] || ""}>{statusMap[n.status] || n.status}</Badge></TableCell>
                    {hasAnyAction && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/contratos-pj/${n.contrato_id}`)}><Eye className="mr-2 h-4 w-4" /> Ver Contrato</DropdownMenuItem>
                            {canEdit && <DropdownMenuItem onClick={() => { setEditNota(n); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>}
                            {canDelete && <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(n)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {notas.length} notas fiscais</p>
          </div>
        </CardContent>
      </Card>

      {/* Form Dialog */}
      {formOpen && (
        <NotaFiscalFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          nota={editNota}
          contratos={contratos}
          onSaved={fetchData}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Excluir a nota fiscal <strong>{deleteTarget?.numero}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImportNFDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        contratos={contratos}
        onSuccess={fetchData}
      />
    </PageShell>
  );
}

function NotaFiscalFormDialog({ open, onClose, nota, contratos, onSaved }: {
  open: boolean; onClose: () => void; nota: NotaComContrato | null; contratos: ContratoPJOption[]; onSaved: () => void;
}) {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const { data: statusParams } = useParametros("status_nota_fiscal");
  const statusMap = useMemo(() => {
    if (statusParams && statusParams.length > 0) {
      return Object.fromEntries(statusParams.map((p) => [p.valor, p.label]));
    }
    return defaultStatusMap;
  }, [statusParams]);
  const [saving, setSaving] = useState(false);
  // Normalize competencia to YYYY-MM for type="month" input
  const normalizeCompetencia = (c: string | undefined | null): string => {
    if (!c) return "";
    // Already YYYY-MM
    if (/^\d{4}-\d{2}$/.test(c)) return c;
    // MM/YYYY
    if (/^\d{2}\/\d{4}$/.test(c)) return `${c.slice(3)}-${c.slice(0, 2)}`;
    // MMYYYY
    if (/^\d{6}$/.test(c)) return `${c.slice(2)}-${c.slice(0, 2)}`;
    return c;
  };
  const [form, setForm] = useState({
    contrato_id: nota?.contrato_id || "",
    numero: nota?.numero || "", serie: nota?.serie || "", valor: nota?.valor?.toString() || "",
    data_emissao: nota?.data_emissao || "", data_vencimento: nota?.data_vencimento || "",
    competencia: normalizeCompetencia(nota?.competencia), descricao: nota?.descricao || "",
    status: nota?.status || "pendente", observacoes: nota?.observacoes || "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!isSuperAdmin && (!form.contrato_id || !form.numero.trim() || !form.data_emissao || !form.valor || !form.competencia)) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    setSaving(true);
    const normalizedStatus = form.status === "enviada_p_pagamento" ? "enviada_pagamento" : form.status;
    const payload = {
      contrato_id: form.contrato_id, numero: form.numero.trim(), serie: form.serie.trim() || null,
      valor: Number(form.valor), data_emissao: form.data_emissao,
      data_vencimento: form.data_vencimento || null, competencia: form.competencia.trim(),
      descricao: form.descricao.trim() || null, status: normalizedStatus, observacoes: form.observacoes.trim() || null,
    };
    const previousStatus = nota?.status === "enviada_p_pagamento" ? "enviada_pagamento" : nota?.status;
    const isChangingToEnviada = normalizedStatus === "enviada_pagamento" && previousStatus !== "enviada_pagamento";
    try {
      let notaId = nota?.id;
      if (nota) {
        const { error } = await supabase.from("notas_fiscais_pj").update(payload as any).eq("id", nota.id);
        if (error) throw error;
        toast.success("Nota fiscal atualizada!");
      } else {
        const { data: inserted, error } = await supabase.from("notas_fiscais_pj").insert(payload as any).select("id").single();
        if (error) throw error;
        notaId = inserted?.id;
        toast.success("Nota fiscal cadastrada!");
      }

      if (notaId) {
        const { data: existingPagamento, error: existingPagamentoError } = await supabase
          .from("pagamentos_pj")
          .select("id")
          .eq("nota_fiscal_id", notaId)
          .limit(1)
          .maybeSingle();
        if (existingPagamentoError) throw existingPagamentoError;

        if (existingPagamento) {
          const { error: syncError } = await supabase
            .from("pagamentos_pj")
            .update({ status: normalizedStatus } as any)
            .eq("nota_fiscal_id", notaId);
          if (syncError) throw syncError;
        } else if (isChangingToEnviada) {
          const { data: contrato, error: contratoError } = await supabase
            .from("contratos_pj")
            .select("forma_pagamento")
            .eq("id", form.contrato_id)
            .single();
          if (contratoError) throw contratoError;

          const pagPayload = {
            contrato_id: form.contrato_id,
            nota_fiscal_id: notaId,
            valor: Number(form.valor),
            competencia: form.competencia.trim(),
            data_prevista: form.data_vencimento || form.data_emissao,
            forma_pagamento: contrato?.forma_pagamento || "transferencia",
            status: normalizedStatus,
            observacoes: `Pagamento gerado automaticamente a partir da NF ${form.numero.trim()}`,
          };
          const { error: pagError } = await supabase.from("pagamentos_pj").insert(pagPayload as any);
          if (pagError) throw pagError;
          toast.success("Pagamento PJ criado automaticamente!");
        }
      }

      onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{nota ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Contrato *</Label>
            <Select value={form.contrato_id} onValueChange={(v) => set("contrato_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
              <SelectContent>
                {contratos.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Número *</Label><Input value={form.numero} onChange={(e) => set("numero", e.target.value)} /></div>
          <div><Label>Série</Label><Input value={form.serie} onChange={(e) => set("serie", e.target.value)} /></div>
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} /></div>
          <div><Label>Competência *</Label><Input type="month" value={form.competencia} onChange={(e) => set("competencia", e.target.value)} /></div>
          <div><Label>Data Emissão *</Label><Input type="date" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} /></div>
          <div><Label>Data Vencimento</Label><Input type="date" value={form.data_vencimento} onChange={(e) => set("data_vencimento", e.target.value)} /></div>
          {nota && (
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} /></div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
