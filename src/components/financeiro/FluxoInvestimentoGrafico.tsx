import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format-currency";

const FRENTE_COLORS: Record<string, string> = {
  "Marketing Lançamento": "#1A4A3A",
  "Produto": "#E91E63",
  "Fábrica": "#E8833A",
  "TI e Telecom": "#4FC3D8",
  "Show Room": "#8B1A2F",
};

const FALLBACK_COLORS = ["#1A4A3A", "#E91E63", "#E8833A", "#4FC3D8", "#8B1A2F", "#6A4C93", "#999999"];

function corFrente(nome: string, idx: number): string {
  return FRENTE_COLORS[nome] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function formatK(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${Math.round(v / 1_000)}k`;
  return `R$ ${v}`;
}

interface Props {
  // chart data: array of { mesLabel, [frenteNome]: valor, ... }
  data: Array<Record<string, string | number>>;
  frenteNomes: string[];
}

export function FluxoInvestimentoGrafico({ data, frenteNomes }: Props) {
  const total = useMemo(() => {
    return data.reduce((acc, row) => {
      let s = 0;
      frenteNomes.forEach((n) => {
        s += Number(row[n] || 0);
      });
      return acc + s;
    }, 0);
  }, [data, frenteNomes]);

  if (total === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground border rounded-lg">
        Sem eventos no período selecionado.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatK} tick={{ fontSize: 12 }} width={70} />
          <Tooltip
            formatter={(v: number) => formatBRL(v)}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {frenteNomes.map((nome, idx) => (
            <Bar key={nome} dataKey={nome} stackId="frentes" fill={corFrente(nome, idx)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
