import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Loader2, BarChart3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface HistoricoCustosChartProps {
  tipo: "clt" | "pj";
  /** colaborador_id for CLT, contrato_id for PJ */
  entityId: string;
}

interface DataPoint {
  competencia: string;
  label: string;
  bruto: number;
  liquido: number;
  encargos: number;
}

export function HistoricoCustosChart({ tipo, entityId }: HistoricoCustosChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["historico_custos", tipo, entityId],
    queryFn: async (): Promise<DataPoint[]> => {
      if (tipo === "clt") {
        const { data: holerites, error } = await supabase
          .from("holerites")
          .select("competencia_id, salario_base, total_proventos, salario_liquido, total_encargos, folha_competencias!inner(competencia)")
          .eq("colaborador_id", entityId)
          .order("competencia_id", { ascending: true });

        if (error || !holerites?.length) return [];

        return holerites.map((h: any) => {
          const comp = h.folha_competencias?.competencia || "";
          return {
            competencia: comp,
            label: formatCompetencia(comp),
            bruto: Number(h.total_proventos) || Number(h.salario_base) || 0,
            liquido: Number(h.salario_liquido) || 0,
            encargos: Number(h.total_encargos) || 0,
          };
        });
      } else {
        // PJ — use pagamentos_pj
        const { data: pagamentos, error } = await supabase
          .from("pagamentos_pj")
          .select("competencia, valor, status")
          .eq("contrato_id", entityId)
          .in("status", ["pago", "pendente"])
          .order("competencia", { ascending: true });

        if (error || !pagamentos?.length) return [];

        return pagamentos.map((p) => ({
          competencia: p.competencia,
          label: formatCompetencia(p.competencia),
          bruto: Number(p.valor) || 0,
          liquido: Number(p.valor) || 0,
          encargos: 0,
        }));
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="card-shadow">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução de Custos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum histórico de pagamento encontrado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label: tooltipLabel }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md">
        <p className="text-sm font-medium mb-1">{tooltipLabel}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {fmt(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  // Build cumulative data
  const cumData = data.reduce<{ label: string; acBruto: number; acLiquido: number; acEncargos: number }[]>((acc, d, i) => {
    const prev = i > 0 ? acc[i - 1] : { acBruto: 0, acLiquido: 0, acEncargos: 0 };
    acc.push({
      label: d.label,
      acBruto: prev.acBruto + d.bruto,
      acLiquido: prev.acLiquido + d.liquido,
      acEncargos: prev.acEncargos + d.encargos,
    });
    return acc;
  }, []);

  const totals = cumData.length > 0 ? cumData[cumData.length - 1] : { acBruto: 0, acLiquido: 0, acEncargos: 0 };

  return (
    <div className="space-y-4">
      {/* Tabela analítica com acumulado */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Histórico Analítico
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[220px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Competência</TableHead>
                  <TableHead className="text-xs text-right">{tipo === "clt" ? "Proventos" : "Valor"}</TableHead>
                  {tipo === "clt" && <TableHead className="text-xs text-right">Líquido</TableHead>}
                  {tipo === "clt" && <TableHead className="text-xs text-right">Encargos</TableHead>}
                  <TableHead className="text-xs text-right">{tipo === "clt" ? "Acum. Proventos" : "Acumulado"}</TableHead>
                  {tipo === "clt" && <TableHead className="text-xs text-right">Acum. Encargos</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d, i) => (
                  <TableRow key={d.competencia} className="text-xs">
                    <TableCell className="py-1.5 font-medium">{d.label}</TableCell>
                    <TableCell className="py-1.5 text-right">{fmt(d.bruto)}</TableCell>
                    {tipo === "clt" && <TableCell className="py-1.5 text-right">{fmt(d.liquido)}</TableCell>}
                    {tipo === "clt" && <TableCell className="py-1.5 text-right">{fmt(d.encargos)}</TableCell>}
                    <TableCell className="py-1.5 text-right font-medium text-primary">{fmt(cumData[i].acBruto)}</TableCell>
                    {tipo === "clt" && <TableCell className="py-1.5 text-right font-medium text-warning">{fmt(cumData[i].acEncargos)}</TableCell>}
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-muted/50 font-medium text-xs">
                  <TableCell className="py-2">TOTAL</TableCell>
                  <TableCell className="py-2 text-right">{fmt(totals.acBruto)}</TableCell>
                  {tipo === "clt" && <TableCell className="py-2 text-right">{fmt(totals.acLiquido)}</TableCell>}
                  {tipo === "clt" && <TableCell className="py-2 text-right">{fmt(totals.acEncargos)}</TableCell>}
                  <TableCell className="py-2 text-right text-primary">{fmt(totals.acBruto)}</TableCell>
                  {tipo === "clt" && <TableCell className="py-2 text-right text-warning">{fmt(totals.acEncargos)}</TableCell>}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de evolução */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução de Custos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                className="fill-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="bruto"
                name={tipo === "clt" ? "Total Proventos" : "Valor Pago"}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              {tipo === "clt" && (
                <>
                  <Line
                    type="monotone"
                    dataKey="liquido"
                    name="Salário Líquido"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="encargos"
                    name="Encargos"
                    stroke="hsl(var(--warning))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCompetencia(comp: string): string {
  // Expected format: "2026-05" or "Maio 2026"
  if (!comp) return "";
  const match = comp.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[parseInt(match[2]) - 1]}/${match[1].slice(2)}`;
  }
  // Try "Mês Ano" format
  const parts = comp.split(" ");
  if (parts.length === 2) {
    const monthMap: Record<string, string> = {
      janeiro: "Jan", fevereiro: "Fev", março: "Mar", abril: "Abr",
      maio: "Mai", junho: "Jun", julho: "Jul", agosto: "Ago",
      setembro: "Set", outubro: "Out", novembro: "Nov", dezembro: "Dez",
    };
    const short = monthMap[parts[0].toLowerCase()] || parts[0].slice(0, 3);
    return `${short}/${parts[1].slice(2)}`;
  }
  return comp;
}
