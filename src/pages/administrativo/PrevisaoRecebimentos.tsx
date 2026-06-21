import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import {
  TrendingDown,
  ArrowDownToLine,
  Calendar,
  AlertTriangle,
  HelpCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

type Row = {
  id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  conta_id: string | null;
  parceiro_id: string | null;
  cliente: string | null;
  meio_pagamento: "boleto" | "cartao" | "pix" | string | null;
  valor: number;
  nf_id: string | null;
  nf_numero: string | null;
  data_vencimento: string | null;
  estagio: "a_faturar" | "a_receber" | string;
  condicional: boolean;
  data_liquidacao_prevista: string | null;
  mes_referencia: string | null;
};

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function mesLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]}/${String(y).slice(2)}`;
}

function diasAFrente(dateIso: string | null, n: number, hoje: Date) {
  if (!dateIso) return false;
  const d = new Date(dateIso + "T00:00:00");
  const lim = new Date(hoje);
  lim.setDate(lim.getDate() + n);
  return d >= hoje && d <= lim;
}

export default function PrevisaoRecebimentos() {
  const [filtroInstr, setFiltroInstr] = useState<string>("todos");
  const [filtroEstagio, setFiltroEstagio] = useState<string>("todos");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["vw-previsao-recebimentos"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_previsao_recebimentos")
        .select("*")
        .order("data_liquidacao_prevista", { ascending: true });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const all = rows || [];

  const semRegua = all.filter((r) => !r.data_liquidacao_prevista).length;

  // KPI splits
  function splitFirmCond(filter: (r: Row) => boolean) {
    let firme = 0;
    let cond = 0;
    for (const r of all) {
      if (!filter(r)) continue;
      if (r.condicional) cond += Number(r.valor || 0);
      else firme += Number(r.valor || 0);
    }
    return { firme, cond, total: firme + cond };
  }

  const k30 = splitFirmCond((r) => diasAFrente(r.data_liquidacao_prevista, 30, hoje));
  const k60 = splitFirmCond((r) => diasAFrente(r.data_liquidacao_prevista, 60, hoje));
  const k90 = splitFirmCond((r) => diasAFrente(r.data_liquidacao_prevista, 90, hoje));
  const kAtraso = splitFirmCond((r) => {
    if (!r.data_liquidacao_prevista) return false;
    return new Date(r.data_liquidacao_prevista + "T00:00:00") < hoje;
  });
  const kTotal = splitFirmCond(() => true);

  // Gráfico por mês
  const chartData = useMemo(() => {
    const map = new Map<string, { mes: string; firme: number; condicional: number }>();
    for (const r of all) {
      if (!r.mes_referencia || !r.data_liquidacao_prevista) continue;
      const iso = String(r.mes_referencia).substring(0, 7);
      if (!map.has(iso)) map.set(iso, { mes: iso, firme: 0, condicional: 0 });
      const o = map.get(iso)!;
      if (r.condicional) o.condicional += Number(r.valor || 0);
      else o.firme += Number(r.valor || 0);
    }
    return Array.from(map.values())
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((d) => ({ ...d, label: mesLabel(d.mes) }));
  }, [all]);

  // Tabela filtrada
  const tabela = useMemo(() => {
    return all
      .filter((r) => filtroInstr === "todos" || r.meio_pagamento === filtroInstr)
      .filter((r) => {
        if (filtroEstagio === "todos") return true;
        if (filtroEstagio === "firme") return !r.condicional;
        return r.condicional;
      })
      .sort((a, b) => {
        const da = a.data_liquidacao_prevista || "9999-99-99";
        const db = b.data_liquidacao_prevista || "9999-99-99";
        return da.localeCompare(db);
      });
  }, [all, filtroInstr, filtroEstagio]);

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="h-6 w-6 text-admin" />
            Previsão de Recebimentos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Lente de tesouraria: contraparte de entrada do Fluxo de Caixa Futuro. Soma dois
            estágios do funil — <strong>Firme</strong> (NF emitida) e{" "}
            <strong>Condicional</strong> (pré-NF, só entra se a NF for emitida).
          </p>
        </div>

        {/* Doutrina */}
        <Card className="border-admin/20 bg-admin/5">
          <CardContent className="pt-4 text-xs text-muted-foreground flex items-start gap-3">
            <HelpCircle className="h-4 w-4 text-admin mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 mr-1">Firme</Badge>
                Título com NF emitida — entrada quase certa.
              </p>
              <p>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 mr-1">Condicional</Badge>
                Pré-NF — esse caixa só entra <em>se a NF for emitida</em>. Tratado como cenário, não como caixa firmado.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={<AlertTriangle className="h-3 w-3 text-rose-600" />}
            label="Atrasado"
            k={kAtraso}
            accent="text-rose-700"
            sub="liquidação prevista já passou"
          />
          <KpiCard
            icon={<Calendar className="h-3 w-3 text-admin" />}
            label="Próximos 30 dias"
            k={k30}
            accent="text-admin"
          />
          <KpiCard
            icon={<Calendar className="h-3 w-3 text-amber-700" />}
            label="Próximos 60 dias"
            k={k60}
            accent="text-amber-700"
          />
          <KpiCard
            icon={<Calendar className="h-3 w-3 text-violet-700" />}
            label="Próximos 90 dias"
            k={k90}
            accent="text-violet-700"
          />
          <KpiCard
            icon={<Wallet className="h-3 w-3 text-emerald-700" />}
            label="Total previsto"
            k={kTotal}
            accent="text-emerald-700"
            big
          />
        </div>

        {/* Gráfico */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-admin" />
                Previsão de entrada por mês
              </h2>
              {semRegua > 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  {semRegua} título(s) sem régua de liquidação — ignorado(s) no gráfico
                </span>
              )}
            </div>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma previsão de recebimento.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) =>
                        Number(v).toLocaleString("pt-BR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        })
                      }
                    />
                    <RTooltip
                      formatter={(v: number) => formatBRL(Number(v))}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="firme" stackId="a" fill="hsl(160 70% 40%)" name="Firme (NF)" />
                    <Bar
                      dataKey="condicional"
                      stackId="a"
                      fill="hsl(40 90% 70%)"
                      name="Condicional (pré-NF)"
                      fillOpacity={0.65}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-admin" />
                Títulos previstos
              </h2>
              <div className="flex gap-2">
                <Select value={filtroInstr} onValueChange={setFiltroInstr}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos instrumentos</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroEstagio} onValueChange={setFiltroEstagio}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos estágios</SelectItem>
                    <SelectItem value="firme">Firme (NF)</SelectItem>
                    <SelectItem value="condicional">Condicional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : tabela.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum título com os filtros atuais.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-24">Instrumento</TableHead>
                      <TableHead className="w-28">Estágio</TableHead>
                      <TableHead className="w-28">Vencimento</TableHead>
                      <TableHead className="w-32">Prev. liquidação</TableHead>
                      <TableHead className="w-24">NF</TableHead>
                      <TableHead className="text-right w-32">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabela.map((r) => (
                      <TableRow
                        key={r.id}
                        className={
                          r.condicional
                            ? "bg-amber-50/40 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_6px,hsl(40_90%_70%/0.08)_6px,hsl(40_90%_70%/0.08)_12px)]"
                            : ""
                        }
                      >
                        <TableCell className="text-xs">
                          <div className="font-medium">{r.cliente || "—"}</div>
                          {r.numero_titulo && (
                            <div className="text-[10px] text-muted-foreground">
                              {r.numero_titulo}
                              {r.total_parcelas && r.total_parcelas > 1
                                ? ` · ${r.numero_parcela}/${r.total_parcelas}`
                                : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {r.meio_pagamento || "—"}
                        </TableCell>
                        <TableCell>
                          {r.condicional ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-amber-50 text-amber-700 border-amber-300"
                                >
                                  Condicional
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                Depende da emissão da NF. Esse caixa só entra se a NF for
                                emitida.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                            >
                              Firme
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateBR(r.data_vencimento)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateBR(r.data_liquidacao_prevista)}
                        </TableCell>
                        <TableCell className="text-xs">{r.nf_numero || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatBRL(Number(r.valor || 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  icon,
  label,
  k,
  accent,
  sub,
  big,
}: {
  icon: React.ReactNode;
  label: string;
  k: { firme: number; cond: number; total: number };
  accent: string;
  sub?: string;
  big?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </p>
        <p className={`${big ? "text-2xl" : "text-xl"} font-bold ${accent}`}>
          {formatBRL(k.total)}
        </p>
        <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-emerald-700">Firme</span>
            <span className="font-mono">{formatBRL(k.firme)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-amber-700">Condicional</span>
            <span className="font-mono">{formatBRL(k.cond)}</span>
          </div>
          {sub && <div className="italic pt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
