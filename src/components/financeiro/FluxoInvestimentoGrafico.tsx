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

// Paleta monocromática Verde Fetely — escala do escuro (frente principal)
// ao claro (frente menor). Inclui sage Fetely (#8FB87A) da paleta oficial do DNA.
const VERDE_FETELY_SCALE = [
  "#1A4A3A", // 0 — Verde Fetely (cor base)
  "#2D6B4F", // 1 — Verde médio-escuro
  "#4F8A6A", // 2 — Verde médio
  "#7AAA8E", // 3 — Verde médio-claro
  "#8FB87A", // 4 — Sage Fetely (cor secundária oficial)
  "#BCD9C8", // 5 — Verde claro
];

function corFrente(_nome: string, idx: number): string {
  return VERDE_FETELY_SCALE[idx % VERDE_FETELY_SCALE.length];
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
