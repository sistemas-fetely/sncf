import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, TrendingUp, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SalarioMasked } from "@/components/SalarioMasked";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const statusMap: Record<string, string> = {
  pendente: "Pendente", aprovada: "Aprovada", enviada_pagamento: "Enviada p/ Pgto",
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

const BRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function PagamentoPJRelatorio() {
  const { contratoId } = useParams<{ contratoId: string }>();
  const navigate = useNavigate();

  const [contrato, setContrato] = useState<any>(null);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contratoId) return;
    const fetch = async () => {
      const [{ data: c }, { data: pags }] = await Promise.all([
        supabase.from("contratos_pj").select("id, razao_social, nome_fantasia, cnpj, valor_mensal, status, data_inicio, data_fim, user_id").eq("id", contratoId).single(),
        supabase.from("pagamentos_pj").select("*, notas_fiscais_pj(numero)").eq("contrato_id", contratoId).order("competencia", { ascending: true }),
      ]);
      setContrato(c);
      setPagamentos((pags || []).map((p: any) => ({ ...p, nf_numero: p.notas_fiscais_pj?.numero || null })));
      setLoading(false);
    };
    fetch();
  }, [contratoId]);

  const paidStatuses = ["paga", "pago"];
  const pendingStatuses = ["pendente", "aprovada", "enviada_pagamento"];

  const totalPago = useMemo(() => pagamentos.filter(p => paidStatuses.includes(p.status)).reduce((s, p) => s + Number(p.valor), 0), [pagamentos]);
  const totalPendente = useMemo(() => pagamentos.filter(p => pendingStatuses.includes(p.status)).reduce((s, p) => s + Number(p.valor), 0), [pagamentos]);
  const mediaMensal = useMemo(() => {
    const paid = pagamentos.filter(p => paidStatuses.includes(p.status));
    return paid.length > 0 ? totalPago / paid.length : 0;
  }, [pagamentos, totalPago]);

  const chartData = useMemo(() => {
    const map = new Map<string, { competencia: string; valor: number; status: string }>();
    pagamentos.forEach(p => {
      const key = p.competencia;
      const existing = map.get(key);
      if (existing) {
        existing.valor += Number(p.valor);
      } else {
        map.set(key, { competencia: key, valor: Number(p.valor), status: p.status });
      }
    });
    return Array.from(map.values()).map(d => ({
      ...d,
      label: /^\d{4}-\d{2}$/.test(d.competencia) ? format(parseISO(`${d.competencia}-01`), "MMM/yy", { locale: ptBR }) : d.competencia,
    }));
  }, [pagamentos]);

  const nome = nomeCanonico(contrato?.razao_social, "—");
  const apelido = apelidoParceiro(contrato?.razao_social, contrato?.nome_fantasia);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pagamentos-pj")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Relatório de Pagamentos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{nome} — CNPJ: {contrato?.cnpj || "—"}</p>
          {apelido && (
            <p className="text-muted-foreground text-xs mt-0.5">{apelido}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate(`/contratos-pj/${contratoId}`)}>
          <FileText className="h-4 w-4 mr-2" /> Ver Contrato
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pagamentos.length}</p>
              <p className="text-xs text-muted-foreground">Total Pagamentos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                <SalarioMasked valor={totalPago} userId={contrato?.user_id || null} contexto="relatorio_pj" />
              </div>
              <p className="text-xs text-muted-foreground">Total Pago</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                <SalarioMasked valor={totalPendente} userId={contrato?.user_id || null} contexto="relatorio_pj" />
              </div>
              <p className="text-xs text-muted-foreground">A Pagar</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                <SalarioMasked valor={mediaMensal} userId={contrato?.user_id || null} contexto="relatorio_pj" />
              </div>
              <p className="text-xs text-muted-foreground">Média Mensal</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Evolução de Pagamentos por Competência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => [BRL(value), "Valor"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={paidStatuses.includes(entry.status) ? "hsl(var(--success))" : "hsl(var(--warning))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="card-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Histórico Detalhado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Competência</TableHead>
                  <TableHead className="font-semibold">Nº NF</TableHead>
                  <TableHead className="font-semibold">Data Prevista</TableHead>
                  <TableHead className="font-semibold">Data Pgto</TableHead>
                  <TableHead className="font-semibold">Valor</TableHead>
                  <TableHead className="font-semibold">Forma</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum pagamento registrado.</TableCell>
                  </TableRow>
                ) : pagamentos.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm font-medium">
                      {/^\d{4}-\d{2}$/.test(p.competencia) ? format(parseISO(`${p.competencia}-01`), "MM/yyyy") : p.competencia}
                    </TableCell>
                    <TableCell className="text-sm">{p.nf_numero || "—"}</TableCell>
                    <TableCell className="text-sm">{format(parseISO(p.data_prevista), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-sm">{p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm font-medium">
                      <SalarioMasked valor={Number(p.valor)} userId={contrato?.user_id || null} contexto="relatorio_pj" />
                    </TableCell>
                    <TableCell className="text-sm">{p.forma_pagamento}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[p.status] || ""}>
                        {statusMap[p.status] || p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pagamentos.length > 0 && (
            <div className="flex justify-end pt-4 border-t mt-4">
              <div className="text-sm space-y-1 text-right">
                <p>Total Pago: <span className="font-semibold text-success">{BRL(totalPago)}</span></p>
                <p>Total Pendente: <span className="font-semibold text-warning">{BRL(totalPendente)}</span></p>
                <p>Total Geral: <span className="font-bold">{BRL(totalPago + totalPendente)}</span></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
