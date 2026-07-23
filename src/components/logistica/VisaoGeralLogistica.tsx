import { useMemo } from "react";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent, Package, AlertTriangle, Truck, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLogisticaPnl, type LogisticaPnlRow } from "@/hooks/logistica/useLogisticaPnl";
import { useRastreioNf } from "@/hooks/logistica/useRastreioNf";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");
const n = (v: number | null | undefined) => Number(v ?? 0);

function StatCardMini({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "info" | "warning" | "destructive" | "default";
  hint?: string;
}) {
  const toneCls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "info"
      ? "bg-info/10 text-info"
      : tone === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary";
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
        {hint ? <div className="text-[11px] text-muted-foreground truncate">{hint}</div> : null}
      </div>
    </div>
  );
}

function mesLabel(mes: string): string {
  const d = new Date(mes.length === 10 ? `${mes}T00:00:00` : mes);
  if (isNaN(d.getTime())) return mes;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function VisaoGeralLogistica() {
  const pnlQuery = useLogisticaPnl();
  const rastreioQuery = useRastreioNf();

  const pnlRows = pnlQuery.data ?? [];
  const rastreioRows = rastreioQuery.data ?? [];

  // Agregados P&L
  const totais = useMemo(() => {
    const receita = pnlRows.reduce((a, r) => a + n(r.receita_frete), 0);
    const custo = pnlRows.reduce((a, r) => a + n(r.custo_frete), 0);
    const margem = pnlRows.reduce((a, r) => a + n(r.margem), 0);
    const baseNf = pnlRows.reduce((a, r) => a + n(r.base_nf), 0);
    const nfs = pnlRows.reduce((a, r) => a + n(r.nfs), 0);
    const nfsComFrete = pnlRows.reduce((a, r) => a + n(r.nfs_com_frete), 0);
    const nfsSemFrete = Math.max(nfs - nfsComFrete, 0);
    const pctRec = custo > 0 ? (receita / custo) * 100 : 0;
    const pctNf = baseNf > 0 ? (receita / baseNf) * 100 : 0;
    return { receita, custo, margem, baseNf, nfs, nfsComFrete, nfsSemFrete, pctRec, pctNf };
  }, [pnlRows]);

  // Série mensal (soma por mês)
  const serieMensal = useMemo(() => {
    const map = new Map<string, { mes: string; receita: number; custo: number; margem: number }>();
    for (const r of pnlRows) {
      const key = r.mes;
      const cur = map.get(key) ?? { mes: key, receita: 0, custo: 0, margem: 0 };
      cur.receita += n(r.receita_frete);
      cur.custo += n(r.custo_frete);
      cur.margem += n(r.margem);
      map.set(key, cur);
    }
    return [...map.values()]
      .sort((a, b) => (a.mes < b.mes ? -1 : 1))
      .map((r) => ({ ...r, mesLabel: mesLabel(r.mes) }));
  }, [pnlRows]);

  // Agrupamento por transportadora
  const porTransportadora = useMemo(() => {
    const map = new Map<string, {
      transportadora: string;
      receita: number;
      custo: number;
      margem: number;
      receita_sem_custo: boolean;
    }>();
    for (const r of pnlRows) {
      const key = r.transportadora ?? "—";
      const cur = map.get(key) ?? {
        transportadora: key,
        receita: 0,
        custo: 0,
        margem: 0,
        receita_sem_custo: false,
      };
      cur.receita += n(r.receita_frete);
      cur.custo += n(r.custo_frete);
      cur.margem += n(r.margem);
      if (r.receita_sem_custo) cur.receita_sem_custo = true;
      map.set(key, cur);
    }
    return [...map.values()]
      .filter((r) => r.receita !== 0 || r.custo !== 0)
      .sort((a, b) => b.receita - a.receita);
  }, [pnlRows]);

  // KPIs operacionais (rastreio)
  const opsKpis = useMemo(() => {
    const total = rastreioRows.length;
    const comDatas = rastreioRows.filter((r) => r.data_entrega && r.previsao_entrega);
    const onTime = comDatas.filter((r) => new Date(r.data_entrega!) <= new Date(r.previsao_entrega!)).length;
    const onTimePct = comDatas.length > 0 ? (onTime / comDatas.length) * 100 : 0;
    const devolucoes = rastreioRows.filter((r) => r.eh_devolucao).length;
    const devPct = total > 0 ? (devolucoes / total) * 100 : 0;
    const entregues = rastreioRows.filter((r) => r.data_entrega).length;
    return { total, comDatas: comDatas.length, onTimePct, devolucoes, devPct, entregues };
  }, [rastreioRows]);

  const mixTransp = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rastreioRows) {
      const key = r.transportadora_nome ?? "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [rastreioRows]);

  if (pnlQuery.isLoading || rastreioQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando dashboard…
      </div>
    );
  }

  const semDados = pnlRows.length === 0 && rastreioRows.length === 0;
  if (semDados) {
    return (
      <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
        Nenhum dado logístico ainda.
      </div>
    );
  }

  const margemNeg = totais.margem < 0;

  return (
    <div className="space-y-8">
      {/* ================= BLOCO 1 — P&L ================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">P&L da Logística</h2>
          <span className="text-xs text-muted-foreground">Receita cobrada × custo real por transportadora</span>
        </div>

        {/* Cards de topo */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCardMini
            label="Receita de frete"
            value={BRL.format(totais.receita)}
            icon={TrendingUp}
            tone="success"
          />
          <StatCardMini
            label="Custo real"
            value={BRL.format(totais.custo)}
            icon={TrendingDown}
            tone="info"
          />
          <StatCardMini
            label="Margem"
            value={BRL.format(totais.margem)}
            icon={margemNeg ? TrendingDown : TrendingUp}
            tone={margemNeg ? "destructive" : "success"}
          />
          <StatCardMini
            label="% recuperação"
            value={`${totais.pctRec.toFixed(1)}%`}
            icon={Percent}
            tone={totais.pctRec >= 100 ? "success" : "warning"}
            hint="Receita ÷ custo"
          />
          <StatCardMini
            label="Frete % da NF"
            value={`${totais.pctNf.toFixed(1)}%`}
            icon={Percent}
            tone="info"
            hint="Receita ÷ base NF"
          />
          <StatCardMini
            label="NFs c/ frete zero"
            value={NUM.format(totais.nfsSemFrete)}
            icon={AlertTriangle}
            tone="warning"
            hint="Absorvido pela Fetely"
          />
        </div>

        {/* Gráfico mensal */}
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3">Evolução mensal — receita × custo × margem</div>
            {serieMensal.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados de P&L.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart data={serieMensal} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                      width={80}
                    />
                    <Tooltip formatter={(v: number) => BRL.format(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="receita" name="Receita" fill="hsl(var(--success))" />
                    <Bar dataKey="custo" name="Custo" fill="hsl(var(--info))" />
                    <Line
                      type="monotone"
                      dataKey="margem"
                      name="Margem"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela por transportadora */}
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">Por transportadora</div>
              <div className="text-xs text-muted-foreground">
                Marcadas como "sem custo rastreado" quando não há CTe importado.
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transportadora</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-right">% recuperação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porTransportadora.map((r) => {
                    const pctRec = r.custo > 0 ? (r.receita / r.custo) * 100 : 0;
                    const neg = r.margem < 0;
                    return (
                      <TableRow key={r.transportadora}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.transportadora}</span>
                            {r.receita_sem_custo ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                sem custo rastreado
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{BRL.format(r.receita)}</TableCell>
                        <TableCell className="text-right tabular-nums">{BRL.format(r.custo)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            neg ? "text-destructive" : "text-success"
                          )}
                        >
                          {BRL.format(r.margem)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.custo > 0 ? `${pctRec.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {porTransportadora.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Nenhuma transportadora com movimento.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ================= BLOCO 2 — KPIs OPERACIONAIS ================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">KPIs operacionais</h2>
          <span className="text-xs text-muted-foreground">Baseado nos rastreios importados</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCardMini
            label="On-time %"
            value={`${opsKpis.onTimePct.toFixed(1)}%`}
            icon={CheckCircle2}
            tone={opsKpis.onTimePct >= 90 ? "success" : opsKpis.onTimePct >= 75 ? "warning" : "destructive"}
            hint={`${NUM.format(opsKpis.comDatas)} rastreios avaliados`}
          />
          <StatCardMini
            label="Taxa de devolução"
            value={`${opsKpis.devPct.toFixed(1)}%`}
            icon={RotateCcw}
            tone={opsKpis.devPct <= 2 ? "success" : opsKpis.devPct <= 5 ? "warning" : "destructive"}
            hint={`${NUM.format(opsKpis.devolucoes)} devoluções`}
          />
          <StatCardMini
            label="Entregues"
            value={NUM.format(opsKpis.entregues)}
            icon={Package}
            tone="success"
          />
          <StatCardMini
            label="Total rastreado"
            value={NUM.format(opsKpis.total)}
            icon={Truck}
            tone="info"
          />
        </div>

        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3">Mix por transportadora — nº de rastreios</div>
            {mixTransp.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem rastreios ainda.</div>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={mixTransp} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={50} />
                    <Tooltip formatter={(v: number) => NUM.format(Number(v))} />
                    <Bar dataKey="qtd" name="Rastreios" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
