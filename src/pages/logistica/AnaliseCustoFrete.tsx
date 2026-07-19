import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Truck, TrendingUp, Percent, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { SmartBackButton } from "@/components/SmartBackButton";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { humanizeError } from "@/lib/errorMessages";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number | null | undefined) => `${(Number(v) || 0).toFixed(1)}%`;
const fmtKg = (v: number | null | undefined) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

interface CustoTransp {
  transportadora_id: string;
  transportadora: string;
  qtd_fretes: number;
  frete_total: number;
  frete_medio: number;
  pct_frete_nf_medio: number;
  peso_taxado_total: number;
}

interface FreteMensal {
  mes: string;
  qtd_fretes: number;
  frete_total: number;
  pct_frete_nf_medio: number;
}

export default function AnaliseCustoFrete() {
  const navigate = useNavigate();

  const transpQuery = useQuery({
    queryKey: ["logistica-custo-transp"],
    queryFn: async (): Promise<CustoTransp[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_custo_transportadora")
        .select("*");
      if (error) throw error;
      return (data ?? []) as CustoTransp[];
    },
  });

  const mensalQuery = useQuery({
    queryKey: ["logistica-frete-mensal"],
    queryFn: async (): Promise<FreteMensal[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_frete_mensal")
        .select("*");
      if (error) throw error;
      return (data ?? []) as FreteMensal[];
    },
  });

  useEffect(() => {
    if (transpQuery.error) toast.error(humanizeError((transpQuery.error as Error).message));
  }, [transpQuery.error]);
  useEffect(() => {
    if (mensalQuery.error) toast.error(humanizeError((mensalQuery.error as Error).message));
  }, [mensalQuery.error]);

  const transp = transpQuery.data ?? [];
  const mensal = mensalQuery.data ?? [];

  const totalFrete = transp.reduce((s, r) => s + Number(r.frete_total || 0), 0);
  const totalQtd = transp.reduce((s, r) => s + Number(r.qtd_fretes || 0), 0);
  const totalPeso = transp.reduce((s, r) => s + Number(r.peso_taxado_total || 0), 0);
  const freteMedio = totalQtd > 0 ? totalFrete / totalQtd : 0;
  const pctMedioPond =
    totalQtd > 0
      ? transp.reduce((s, r) => s + Number(r.pct_frete_nf_medio || 0) * Number(r.qtd_fretes || 0), 0) / totalQtd
      : 0;

  const dadosBar = [...transp]
    .sort((a, b) => Number(b.frete_total || 0) - Number(a.frete_total || 0))
    .map((r) => ({ nome: r.transportadora, frete_total: Number(r.frete_total || 0) }));

  const dadosMensal = [...mensal]
    .sort((a, b) => (a.mes < b.mes ? -1 : 1))
    .map((r) => {
      const d = new Date(r.mes + (r.mes.length === 10 ? "T00:00:00" : ""));
      const label = isNaN(d.getTime())
        ? r.mes
        : `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      return {
        mesLabel: label,
        frete_total: Number(r.frete_total || 0),
        pct_frete_nf_medio: Number(r.pct_frete_nf_medio || 0),
      };
    });

  const loading = transpQuery.isLoading || mensalQuery.isLoading;
  const vazio = !loading && transp.length === 0 && mensal.length === 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <SmartBackButton fallback="/logistica" fallbackLabel="Voltar" />

      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-gold" />
          <h1 className="font-serif text-2xl">Análise de Custo de Frete</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Custo de frete por transportadora e ao longo do tempo
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : vazio ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhum frete importado ainda.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatCard title="Frete total" value={fmtBRL(totalFrete)} icon={Truck} variant="default" />
            <StatCard title="Frete médio" value={fmtBRL(freteMedio)} icon={TrendingUp} variant="info" />
            <StatCard title="% frete sobre NF" value={fmtPct(pctMedioPond)} icon={Percent} variant="warning" />
            <StatCard title="Total de fretes" value={totalQtd.toLocaleString("pt-BR")} icon={Package} variant="success" />
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-3">Custo total por transportadora</h2>
            {dadosBar.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={dadosBar} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                      width={80}
                    />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Bar dataKey="frete_total" fill="#1A4A3A" name="Frete total" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-3">Evolução mensal do frete</h2>
            {dadosMensal.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart data={dadosMensal} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                      width={80}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                      width={50}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        name === "% frete/NF" ? fmtPct(v) : fmtBRL(v)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="frete_total" fill="#1A4A3A" name="Frete total" />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="pct_frete_nf_medio"
                      stroke="#8FB87A"
                      strokeWidth={2}
                      name="% frete/NF"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="text-sm font-medium">Detalhamento por transportadora</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transportadora</TableHead>
                  <TableHead className="text-right">Fretes</TableHead>
                  <TableHead className="text-right">Frete total</TableHead>
                  <TableHead className="text-right">Frete médio</TableHead>
                  <TableHead className="text-right">% frete/NF</TableHead>
                  <TableHead className="text-right">Peso taxado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transp.map((r) => (
                  <TableRow key={r.transportadora_id}>
                    <TableCell className="font-medium">{r.transportadora}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.qtd_fretes || 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.frete_total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.frete_medio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(r.pct_frete_nf_medio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtKg(r.peso_taxado_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {totalQtd.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBRL(totalFrete)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBRL(freteMedio)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtPct(pctMedioPond)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtKg(totalPeso)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
