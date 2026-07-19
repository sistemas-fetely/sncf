import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  BarChart3, ArrowDown, ArrowUp, ChevronDown, ChevronRight,
  AlertTriangle, Building2, Receipt, Package,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format-currency";


// ─── Tipos ────────────────────────────────────────────────────────
type Bloco = "operacional" | "capex" | "imposto" | "nao_classificado";

interface Linha {
  id: string;
  competencia: string; // YYYY-MM-DD (dia 1)
  valor: number;
  descricao: string | null;
  fornecedor_cliente: string | null;
  nf_numero: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  grupo_codigo: string | null;
  grupo_nome: string | null;
  bloco: Bloco;
  centro_nome: string | null;
  revisao_origem: string | null;
  classificacao_completa: boolean | null;
}

// ─── Cores ────────────────────────────────────────────────────────
const CORES_GRUPO = ["#1A4A3A", "#2d6a52", "#4f8b6f", "#7aac8f", "#a3ccb4", "#3b82f6", "#8b5cf6", "#E91E63", "#0ea5e9", "#14b8a6", "#f97316"];
const COR_CAPEX = "#d97706";

// ─── Helpers ──────────────────────────────────────────────────────
function fmtMesLabel(iso: string) {
  const [y, m] = iso.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}
function fmtPct(v: number, casas = 1) {
  if (!isFinite(v)) return "—";
  return `${v.toFixed(casas).replace(".", ",")}%`;
}
function deltaPct(a: number, b: number): number | null {
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}
function monthKey(iso: string) { return iso.slice(0, 7); } // YYYY-MM

// ─── Página ───────────────────────────────────────────────────────
export default function AnaliseDespesas() {
  const navigate = useNavigate();
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["analise-despesas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_analise_despesas")
        .select("*")
        .order("competencia", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  useEffect(() => {
    if (error) toast.error((error as Error).message ?? "Erro ao carregar análise");
  }, [error]);

  // Lista de meses presentes
  const meses = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    for (const r of data) if (r.competencia) s.add(monthKey(r.competencia));
    return Array.from(s).sort();
  }, [data]);

  useEffect(() => {
    if (!mesSel && meses.length) setMesSel(meses[meses.length - 1]);
  }, [meses, mesSel]);

  // Agregações por mês/bloco
  const agregacoes = useMemo(() => {
    if (!data) return null;
    const porMes: Record<string, { operacional: number; capex: number; imposto: number; nao_classificado: number }> = {};
    for (const r of data) {
      const k = monthKey(r.competencia);
      if (!porMes[k]) porMes[k] = { operacional: 0, capex: 0, imposto: 0, nao_classificado: 0 };
      porMes[k][r.bloco] = (porMes[k][r.bloco] ?? 0) + Number(r.valor ?? 0);
    }
    return porMes;
  }, [data]);

  // Linhas do mês selecionado
  const linhasMes = useMemo(() => {
    if (!data || !mesSel) return [];
    return data.filter((r) => monthKey(r.competencia) === mesSel);
  }, [data, mesSel]);

  const totaisMes = useMemo(() => {
    const t = { operacional: 0, capex: 0, imposto: 0, nao_classificado: 0 };
    for (const r of linhasMes) t[r.bloco] += Number(r.valor ?? 0);
    return t;
  }, [linhasMes]);

  // Índices mes-1 e média(3m)
  const { mesAnterior, media3m } = useMemo(() => {
    if (!agregacoes || !mesSel) return { mesAnterior: null as any, media3m: null as any };
    const idx = meses.indexOf(mesSel);
    const prev = idx > 0 ? agregacoes[meses[idx - 1]] : null;
    let soma = 0, n = 0;
    for (let i = idx - 3; i < idx; i++) {
      if (i >= 0) { soma += agregacoes[meses[i]].operacional; n++; }
    }
    return { mesAnterior: prev, media3m: n ? soma / n : null };
  }, [agregacoes, meses, mesSel]);

  // Classificação
  const classifMes = useMemo(() => {
    const total = linhasMes.length;
    const naoClass = linhasMes.filter((r) => !r.classificacao_completa).length;
    const pct = total ? ((total - naoClass) / total) * 100 : 100;
    return { total, naoClass, pct };
  }, [linhasMes]);

  // Grupos operacionais do mês (N1)
  const gruposMes = useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string; valor: number; folhas: Map<string, { codigo: string; nome: string; valor: number }> }>();
    for (const r of linhasMes) {
      if (r.bloco !== "operacional") continue;
      const gk = r.grupo_codigo ?? "—";
      const gnome = r.grupo_nome ?? "Sem grupo";
      const cur = map.get(gk) ?? { codigo: gk, nome: gnome, valor: 0, folhas: new Map() };
      cur.valor += Number(r.valor ?? 0);
      const fk = r.plano_codigo ?? "—";
      const fnome = r.plano_nome ?? "Sem conta";
      const f = cur.folhas.get(fk) ?? { codigo: fk, nome: fnome, valor: 0 };
      f.valor += Number(r.valor ?? 0);
      cur.folhas.set(fk, f);
      map.set(gk, cur);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, folhas: Array.from(g.folhas.values()).sort((a, b) => b.valor - a.valor) }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhasMes]);

  // Grupos do mês anterior (para delta)
  const gruposMesAnterior = useMemo(() => {
    if (!data || !mesSel) return new Map<string, number>();
    const idx = meses.indexOf(mesSel);
    const prev = idx > 0 ? meses[idx - 1] : null;
    if (!prev) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const r of data) {
      if (monthKey(r.competencia) !== prev || r.bloco !== "operacional") continue;
      const k = r.grupo_codigo ?? "—";
      map.set(k, (map.get(k) ?? 0) + Number(r.valor ?? 0));
    }
    return map;
  }, [data, meses, mesSel]);

  // Dados do gráfico (todos os meses)
  const chartData = useMemo(() => {
    if (!data) return { rows: [] as any[], grupos: [] as string[] };
    const grupos = new Set<string>();
    const porMesPorGrupo: Record<string, Record<string, number>> = {};
    const capexPorMes: Record<string, number> = {};
    for (const r of data) {
      const k = monthKey(r.competencia);
      if (r.bloco === "operacional") {
        const g = r.grupo_nome ?? "Sem grupo";
        grupos.add(g);
        porMesPorGrupo[k] = porMesPorGrupo[k] ?? {};
        porMesPorGrupo[k][g] = (porMesPorGrupo[k][g] ?? 0) + Number(r.valor ?? 0);
      } else if (r.bloco === "capex") {
        capexPorMes[k] = (capexPorMes[k] ?? 0) + Number(r.valor ?? 0);
      }
    }
    const gArr = Array.from(grupos);
    const rows = meses.map((k) => {
      const row: any = { mes: k, label: fmtMesLabel(k + "-01") };
      for (const g of gArr) row[g] = porMesPorGrupo[k]?.[g] ?? 0;
      row.__capex = capexPorMes[k] ?? 0;
      return row;
    });
    return { rows, grupos: gArr };
  }, [data, meses]);

  function toggleGrupo(codigo: string) {
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });
  }

  const opAtual = totaisMes.operacional;
  const deltaOpMes = mesAnterior ? deltaPct(opAtual, mesAnterior.operacional) : null;
  const deltaOp3m = media3m ? deltaPct(opAtual, media3m) : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <CasaPageHeader
        icon={BarChart3}
        title="Análise de Despesas"
        description="Visão por competência — valor total no mês de emissão da NF"
      />

      {/* Seletor de mês */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Mês:</span>
        <Select value={mesSel ?? ""} onValueChange={(v) => setMesSel(v)} disabled={!meses.length}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {[...meses].reverse().map((m) => (
              <SelectItem key={m} value={m}>{fmtMesLabel(m + "-01")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Erro */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Erro ao carregar análise</p>
              <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* BLOCO 2 — KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
          </>
        ) : (
          <>
            {/* Operacional */}
            <Card className="card-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Despesa Operacional
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{formatBRL(opAtual)}</div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  {deltaOpMes === null ? (
                    <span className="text-muted-foreground">— vs mês anterior</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 font-medium ${deltaOpMes <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {deltaOpMes <= 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                      {fmtPct(Math.abs(deltaOpMes))}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">vs mês anterior</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {deltaOp3m === null ? "—" : `${deltaOp3m <= 0 ? "▼" : "▲"} ${fmtPct(Math.abs(deltaOp3m))} vs média 3m`}
                </div>
              </CardContent>
            </Card>

            {/* CAPEX destacado */}
            <Card className="card-shadow border-2" style={{ borderColor: COR_CAPEX + "80", background: COR_CAPEX + "0d" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider" style={{ color: COR_CAPEX }}>
                  <Package className="h-3.5 w-3.5" /> CAPEX
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{formatBRL(totaisMes.capex)}</div>
                <p className="mt-2 text-xs text-muted-foreground">Investimentos — fora do operacional</p>
              </CardContent>
            </Card>

            {/* Impostos */}
            <Card className="card-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Receipt className="h-3 w-3" /> Impostos
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums text-muted-foreground">{formatBRL(totaisMes.imposto)}</div>
              </CardContent>
            </Card>

            {/* Classificação */}
            <Card className="card-shadow">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Classificado</div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{fmtPct(classifMes.pct)}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {classifMes.naoClass > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                      {classifMes.naoClass} não classificada(s) —
                      <Link to="/administrativo-fetely/nfs-stage" className="underline text-primary">revisar</Link>
                    </span>
                  ) : (
                    <span>Todas as linhas classificadas</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* BLOCO 3 — Evolução mensal */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Evolução mensal</h2>
              <p className="text-xs text-muted-foreground">Operacional empilhado por grupo · CAPEX em série separada</p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip
                    formatter={(v: any, name: any) => [formatBRL(Number(v)), name === "__capex" ? "CAPEX" : name]}
                    labelFormatter={(l) => l}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(v) => (v === "__capex" ? "CAPEX" : v)}
                  />
                  {chartData.grupos.map((g, i) => (
                    <Bar
                      key={g} dataKey={g} stackId="op"
                      fill={CORES_GRUPO[i % CORES_GRUPO.length]}
                      onClick={(d: any) => d?.mes && setMesSel(d.mes)}
                      cursor="pointer"
                    />
                  ))}
                  <Bar
                    dataKey="__capex" name="CAPEX" fill={COR_CAPEX}
                    onClick={(d: any) => d?.mes && setMesSel(d.mes)}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 4 — Tabela por Grupo (N1) */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Por Grupo do Plano (N1)</h2>
            <p className="text-xs text-muted-foreground">Bloco operacional — {mesSel ? fmtMesLabel(mesSel + "-01") : "—"}</p>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2 w-8"></th>
                    <th className="text-left py-2 px-2">Grupo</th>
                    <th className="text-right py-2 px-2">Valor</th>
                    <th className="text-right py-2 px-2">% do operacional</th>
                    <th className="text-right py-2 px-2">Δ vs mês anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposMes.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem despesas operacionais no mês</td></tr>
                  )}
                  {gruposMes.map((g) => {
                    const pct = opAtual ? (g.valor / opAtual) * 100 : 0;
                    const ant = gruposMesAnterior.get(g.codigo) ?? 0;
                    const dValor = g.valor - ant;
                    const dPct = ant ? (dValor / Math.abs(ant)) * 100 : null;
                    const isOpen = expandidos.has(g.codigo);
                    return (
                      <>
                        <tr key={g.codigo} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleGrupo(g.codigo)}>
                          <td className="py-2 px-2">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="py-2 px-2">
                            <span className="text-xs text-muted-foreground tabular-nums mr-2">{g.codigo}</span>
                            <span className="font-medium">{g.nome}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-semibold tabular-nums">{formatBRL(g.valor)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtPct(pct)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {ant === 0 ? (
                              <span className="text-muted-foreground text-xs">novo</span>
                            ) : (
                              <span className={dValor <= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {formatBRL(dValor)}{dPct !== null && ` (${dPct > 0 ? "+" : ""}${fmtPct(dPct)})`}
                              </span>
                            )}
                          </td>
                        </tr>
                        {isOpen && g.folhas.map((f) => {
                          const pctG = g.valor ? (f.valor / g.valor) * 100 : 0;
                          return (
                            <tr key={g.codigo + "/" + f.codigo} className="border-b bg-muted/20">
                              <td></td>
                              <td className="py-1.5 px-2 pl-8 text-xs text-muted-foreground">
                                <span className="tabular-nums mr-2">{f.codigo}</span>{f.nome}
                              </td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">{formatBRL(f.valor)}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs text-muted-foreground">{fmtPct(pctG)} do grupo</td>
                              <td></td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
                <tfoot className="text-sm">
                  <tr className="border-t-2">
                    <td></td>
                    <td className="py-2 px-2 font-semibold flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" style={{ color: COR_CAPEX }} /> CAPEX do mês
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">fora do operacional</Badge>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold tabular-nums" style={{ color: COR_CAPEX }}>{formatBRL(totaisMes.capex)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td></td>
                    <td className="py-2 px-2 text-muted-foreground flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5" /> Impostos do mês
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{formatBRL(totaisMes.imposto)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  {totaisMes.nao_classificado > 0 && (
                    <tr className="bg-amber-500/10">
                      <td></td>
                      <td className="py-2 px-2 flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-4 w-4" /> Não classificado
                      </td>
                      <td className="py-2 px-2 text-right font-semibold tabular-nums text-amber-700">{formatBRL(totaisMes.nao_classificado)}</td>
                      <td colSpan={2} className="py-2 px-2 text-right">
                        <Button variant="link" size="sm" onClick={() => navigate("/administrativo-fetely/nfs-stage")} className="h-auto p-0 text-amber-700">
                          Revisar em NFs Stage →
                        </Button>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
