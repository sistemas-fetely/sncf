import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard, Search, MoreHorizontal, Eye, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { format, parseISO } from "date-fns";

const formatCompetencia = (c: string) => {
  if (/^\d{4}-\d{2}$/.test(c)) return format(parseISO(`${c}-01`), "MM/yyyy");
  if (/^\d{6}$/.test(c)) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return c;
};

const statusMap: Record<string, string> = {
  pendente: "Pendente", aprovada: "Aprovada", enviada_pagamento: "Enviada para Pagamento",
  paga: "Paga", pago: "Pago", cancelada: "Cancelada", cancelado: "Cancelado", vencida: "Vencida",
};
const statusStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0",
  aprovada: "bg-info/10 text-info border-0",
  enviada_pagamento: "bg-info/10 text-info border-0",
  paga: "bg-success/10 text-success border-0",
  pago: "bg-success/10 text-success border-0",
  cancelada: "bg-destructive/10 text-destructive border-0",
  cancelado: "bg-destructive/10 text-destructive border-0",
  vencida: "bg-destructive/10 text-destructive border-0",
};

interface PagamentoComContrato {
  id: string;
  contrato_id: string;
  nota_fiscal_id: string | null;
  valor: number;
  data_pagamento: string | null;
  data_prevista: string;
  competencia: string;
  forma_pagamento: string;
  comprovante_url: string | null;
  observacoes: string | null;
  status: string;
  contrato_nome: string;
  nf_numero: string | null;
}

interface ContratoPJOption {
  id: string;
  label: string;
}

export default function PagamentosPJ() {
  const navigate = useNavigate();
  const [pagamentos, setPagamentos] = useState<PagamentoComContrato[]>([]);
  const [contratos, setContratos] = useState<ContratoPJOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterContrato, setFilterContrato] = useState("todos");

  const fetchData = async () => {
    const [{ data: pags }, { data: cps }] = await Promise.all([
      supabase.from("pagamentos_pj").select("*, notas_fiscais_pj(numero)").order("data_prevista", { ascending: false }),
      supabase.from("contratos_pj").select("id, razao_social, nome_fantasia").order("razao_social"),
    ]);

    const contratoMap = new Map((cps || []).map((c) => [c.id, c]));
    const mapped: PagamentoComContrato[] = (pags || []).map((p: any) => {
      const c = contratoMap.get(p.contrato_id);
      return { ...p, contrato_nome: nomeExibicao(c?.razao_social, c?.nome_fantasia, "—"), nf_numero: p.notas_fiscais_pj?.numero || null };
    });
    setPagamentos(mapped);
    setContratos((cps || []).map((c) => ({ id: c.id, label: nomeExibicao(c.razao_social, c.nome_fantasia) })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = pagamentos.filter((p) => {
    const matchSearch =
      p.contrato_nome.toLowerCase().includes(search.toLowerCase()) ||
      p.competencia.includes(search);
    const matchStatus = filterStatus === "todos" || p.status === filterStatus;
    const matchContrato = filterContrato === "todos" || p.contrato_id === filterContrato;
    return matchSearch && matchStatus && matchContrato;
  });

  const pendingStatuses = ["pendente", "aprovada", "enviada_pagamento"];
  const paidStatuses = ["paga", "pago"];

  const totalPendentes = pagamentos.filter((p) => pendingStatuses.includes(p.status)).length;
  const totalPagos = pagamentos.filter((p) => paidStatuses.includes(p.status)).length;
  const totalValorPago = pagamentos.filter((p) => paidStatuses.includes(p.status)).reduce((acc, p) => acc + Number(p.valor), 0);
  const totalValorPendente = pagamentos.filter((p) => pendingStatuses.includes(p.status)).reduce((acc, p) => acc + Number(p.valor), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Pagamentos PJ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico de pagamentos anteriores. Novos lançamentos são feitos em{" "}
            <strong>Contas a Pagar</strong>.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-2xl font-medium">{pagamentos.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-2xl font-medium">{totalPendentes}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-2xl font-medium">R$ {totalValorPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">Total Pago</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-2xl font-medium">R$ {totalValorPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">A Pagar</p></div>
        </CardContent></Card>
      </div>

      {/* Filters + Table */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por contrato ou competência..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Contrato</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Nº NF</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Competência</TableHead>
                  <TableHead className="font-medium">Data Prevista</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Data Pgto</TableHead>
                  <TableHead className="font-medium">Valor</TableHead>
                  <TableHead className="font-medium hidden lg:table-cell">Forma</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/pagamentos-pj/${p.contrato_id}`)}>
                    <TableCell className="font-medium text-sm">{p.contrato_nome}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{p.nf_numero || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{formatCompetencia(p.competencia)}</TableCell>
                    <TableCell className="text-sm">{format(parseISO(p.data_prevista), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>R$ {Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{p.forma_pagamento}</TableCell>
                    <TableCell><Badge variant="outline" className={statusStyles[p.status] || ""}>{statusMap[p.status] || p.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/contratos-pj/${p.contrato_id}`)}><Eye className="mr-2 h-4 w-4" /> Ver Contrato</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {pagamentos.length} pagamentos</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
