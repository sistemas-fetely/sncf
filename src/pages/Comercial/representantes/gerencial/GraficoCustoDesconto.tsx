import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Linha } from "@/pages/Comercial/representantes/dados";
import { fmtCompetencia } from "../fmt";
import { num } from "./dados";

/** Linha dupla: custo da comissão % × desconto médio %. Sem legenda solta, sem animação (imprime). */
export function GraficoCustoDesconto({ historico, altura = 200 }: { historico: Linha[]; altura?: number }) {
  const dados = historico.map((l) => ({
    mes: fmtCompetencia(l.competencia),
    custo: l.custo_comissao_pct == null ? null : num(l.custo_comissao_pct),
    desconto: l.desconto_medio_pct == null ? null : num(l.desconto_medio_pct),
  }));

  if (dados.length === 0) return null;

  const fmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

  return (
    <div>
      <div className="mb-1 flex items-center gap-4 text-[7.5pt] text-muted-foreground print:text-[7pt]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 bg-primary" /> Custo da comissão %
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 bg-warning" /> Desconto médio %
        </span>
      </div>
      <div style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmt}
              width={48}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: number | string, nome) => [fmt(Number(v)), nome === "custo" ? "Custo da comissão" : "Desconto médio"]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="custo"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "hsl(var(--primary))" }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="desconto"
              stroke="hsl(var(--warning))"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "hsl(var(--warning))" }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
