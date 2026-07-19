import { useMemo, useState, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  BarChart3, ArrowDown, ArrowUp, ChevronDown, ChevronRight,
  AlertTriangle, Building2, Receipt, Package, Sparkles, TrendingUp, TrendingDown,
  PlusCircle, MinusCircle, RefreshCw, Download, Users, Bot, User as UserIcon, Landmark,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBRL } from "@/lib/format-currency";

// ─── Tipos ────────────────────────────────────────────────────────
type Bloco = "operacional" | "capex" | "imposto" | "nao_classificado";

interface Linha {
  id: string;
  competencia: string;
  valor: number;
  descricao: string | null;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  nf_numero: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  grupo_codigo: string | null;
  grupo_nome: string | null;
  bloco: Bloco;
  centro_nome: string | null;
  revisao_origem: string | null;
  classificacao_completa: boolean | null;
  conta_pagar_id: string | null;
  conciliada: boolean | null;
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
function monthKey(iso: string) { return iso.slice(0, 7); }

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "—";
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return n.toFixed(0);
}

// Cor heatmap: compara com anterior da mesma linha
function heatBg(atual: number, anterior: number): string {
  if (!anterior || !atual) return "";
  const d = (atual - anterior) / Math.abs(anterior);
  if (d > 0.2) return "bg-rose-500/10";
  if (d < -0.2) return "bg-emerald-500/10";
  return "";
}

interface Movimento {
  nome: string;
  valorAtual: number;
  valorAnterior: number;
  delta: number;
  deltaPct: number | null;
}

// ─── Página ───────────────────────────────────────────────────────
export default function AnaliseDespesas() {
  const navigate = useNavigate();
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [modoGrafico, setModoGrafico] = useState<"empilhado" | "tendencia">("empilhado");
  const [gruposOcultos, setGruposOcultos] = useState<Set<string>>(new Set());
  const [insightCache, setInsightCache] = useState<Record<string, string>>({});
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErro, setInsightErro] = useState<string | null>(null);

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

  const meses = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    for (const r of data) if (r.competencia) s.add(monthKey(r.competencia));
    return Array.from(s).sort();
  }, [data]);

  useEffect(() => {
    if (!mesSel && meses.length) setMesSel(meses[meses.length - 1]);
  }, [meses, mesSel]);

  // Agregações por mês/bloco (usado nos KPIs e no gráfico)
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

  const linhasMes = useMemo(() => {
    if (!data || !mesSel) return [];
    return data.filter((r) => monthKey(r.competencia) === mesSel);
  }, [data, mesSel]);

  const totaisMes = useMemo(() => {
    const t = { operacional: 0, capex: 0, imposto: 0, nao_classificado: 0 };
    for (const r of linhasMes) t[r.bloco] += Number(r.valor ?? 0);
    return t;
  }, [linhasMes]);

  const { mesAnteriorKey, mesAnterior, media3m } = useMemo(() => {
    if (!agregacoes || !mesSel) return { mesAnteriorKey: null as string | null, mesAnterior: null as any, media3m: null as any };
    const idx = meses.indexOf(mesSel);
    const prevKey = idx > 0 ? meses[idx - 1] : null;
    const prev = prevKey ? agregacoes[prevKey] : null;
    let soma = 0, n = 0;
    for (let i = idx - 3; i < idx; i++) {
      if (i >= 0) { soma += agregacoes[meses[i]].operacional; n++; }
    }
    return { mesAnteriorKey: prevKey, mesAnterior: prev, media3m: n ? soma / n : null };
  }, [agregacoes, meses, mesSel]);

  const classifMes = useMemo(() => {
    const total = linhasMes.length;
    const naoClass = linhasMes.filter((r) => !r.classificacao_completa).length;
    const pct = total ? ((total - naoClass) / total) * 100 : 100;
    return { total, naoClass, pct };
  }, [linhasMes]);

  // ─── Matriz: grupos operacionais × meses ────────────────────────
  // Estrutura: { grupos: [{codigo, nome, porMes: {mes: valor}, folhas: [{codigo, nome, porMes}] }], mesesOrdenados, totaisOpPorMes }
  const matrizOp = useMemo(() => {
    if (!data) return { grupos: [], totaisPorMes: {} as Record<string, number> };
    type Folha = { codigo: string; nome: string; porMes: Record<string, number> };
    type Grupo = { codigo: string; nome: string; porMes: Record<string, number>; folhas: Map<string, Folha> };
    const gm = new Map<string, Grupo>();
    const totaisPorMes: Record<string, number> = {};
    for (const r of data) {
      if (r.bloco !== "operacional") continue;
      const mk = monthKey(r.competencia);
      const v = Number(r.valor ?? 0);
      const gk = r.grupo_codigo ?? "—";
      const gnome = r.grupo_nome ?? "Sem grupo";
      const cur = gm.get(gk) ?? { codigo: gk, nome: gnome, porMes: {}, folhas: new Map() };
      cur.porMes[mk] = (cur.porMes[mk] ?? 0) + v;
      const fk = r.plano_codigo ?? "—";
      const fnome = r.plano_nome ?? "Sem conta";
      const f = cur.folhas.get(fk) ?? { codigo: fk, nome: fnome, porMes: {} };
      f.porMes[mk] = (f.porMes[mk] ?? 0) + v;
      cur.folhas.set(fk, f);
      gm.set(gk, cur);
      totaisPorMes[mk] = (totaisPorMes[mk] ?? 0) + v;
    }
    // Ordena grupos pela soma total desc; folhas idem
    const grupos = Array.from(gm.values())
      .map((g) => ({
        ...g,
        total: Object.values(g.porMes).reduce((a, b) => a + b, 0),
        folhasArr: Array.from(g.folhas.values())
          .map((f) => ({ ...f, total: Object.values(f.porMes).reduce((a, b) => a + b, 0) }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
    return { grupos, totaisPorMes };
  }, [data]);

  // Matrizes CAPEX e Impostos (por conta folha)
  const matrizCapex = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { codigo: string; nome: string; porMes: Record<string, number>; total: number }>();
    for (const r of data) {
      if (r.bloco !== "capex") continue;
      const mk = monthKey(r.competencia);
      const fk = r.plano_codigo ?? "—";
      const fnome = r.plano_nome ?? "Sem conta";
      const v = Number(r.valor ?? 0);
      const cur = map.get(fk) ?? { codigo: fk, nome: fnome, porMes: {}, total: 0 };
      cur.porMes[mk] = (cur.porMes[mk] ?? 0) + v;
      cur.total += v;
      map.set(fk, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const matrizImpostos = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { codigo: string; nome: string; porMes: Record<string, number>; total: number }>();
    for (const r of data) {
      if (r.bloco !== "imposto") continue;
      const mk = monthKey(r.competencia);
      const fk = r.plano_codigo ?? "—";
      const fnome = r.plano_nome ?? "Sem conta";
      const v = Number(r.valor ?? 0);
      const cur = map.get(fk) ?? { codigo: fk, nome: fnome, porMes: {}, total: 0 };
      cur.porMes[mk] = (cur.porMes[mk] ?? 0) + v;
      cur.total += v;
      map.set(fk, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  // Média 3m para coluna extra da matriz (últimos 3 meses até mesSel exclusive)
  const media3mIdx = useMemo(() => {
    if (!mesSel) return null;
    const idx = meses.indexOf(mesSel);
    if (idx < 0) return null;
    const janela = meses.slice(Math.max(0, idx - 2), idx + 1); // inclusive selecionado
    return { janela };
  }, [mesSel, meses]);

  function media3mDe(porMes: Record<string, number>): number {
    if (!media3mIdx) return 0;
    const { janela } = media3mIdx;
    if (janela.length === 0) return 0;
    const soma = janela.reduce((acc, k) => acc + (porMes[k] ?? 0), 0);
    return soma / janela.length;
  }

  // ─── Gráfico ────────────────────────────────────────────────────
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

  function toggleGrupoOculto(nome: string) {
    setGruposOcultos((s) => {
      const n = new Set(s);
      if (n.has(nome)) n.delete(nome); else n.add(nome);
      return n;
    });
  }

  // ─── "O que mudou" — deterministico, contas folha operacional ──
  const oQueMudou = useMemo(() => {
    if (!mesSel || !mesAnteriorKey) {
      return { aumentos: [] as Movimento[], quedas: [] as Movimento[], novos: [] as { nome: string; valor: number }[], sumiram: [] as { nome: string; valor: number }[] };
    }
    // Agrega por conta folha (plano_codigo) no operacional
    const atual = new Map<string, { nome: string; valor: number }>();
    const anterior = new Map<string, { nome: string; valor: number }>();
    for (const r of data ?? []) {
      if (r.bloco !== "operacional") continue;
      const mk = monthKey(r.competencia);
      const fk = r.plano_codigo ?? r.plano_nome ?? "—";
      const nome = r.plano_nome ?? "Sem conta";
      const v = Number(r.valor ?? 0);
      const alvo = mk === mesSel ? atual : mk === mesAnteriorKey ? anterior : null;
      if (!alvo) continue;
      const cur = alvo.get(fk) ?? { nome, valor: 0 };
      cur.valor += v;
      alvo.set(fk, cur);
    }
    const chaves = new Set<string>([...atual.keys(), ...anterior.keys()]);
    const movs: Movimento[] = [];
    const novos: { nome: string; valor: number }[] = [];
    const sumiram: { nome: string; valor: number }[] = [];
    for (const k of chaves) {
      const a = atual.get(k);
      const b = anterior.get(k);
      const va = a?.valor ?? 0;
      const vb = b?.valor ?? 0;
      const nome = a?.nome ?? b?.nome ?? "—";
      const delta = va - vb;
      if (vb === 0 && va > 0) {
        if (va >= 100) novos.push({ nome, valor: va });
        continue;
      }
      if (va === 0 && vb > 0) {
        if (vb >= 100) sumiram.push({ nome, valor: vb });
        continue;
      }
      if (Math.abs(delta) < 100) continue;
      movs.push({
        nome,
        valorAtual: va,
        valorAnterior: vb,
        delta,
        deltaPct: vb ? (delta / Math.abs(vb)) * 100 : null,
      });
    }
    const aumentos = movs.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const quedas = movs.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    novos.sort((a, b) => b.valor - a.valor);
    sumiram.sort((a, b) => b.valor - a.valor);
    return { aumentos, quedas, novos: novos.slice(0, 8), sumiram: sumiram.slice(0, 8) };
  }, [data, mesSel, mesAnteriorKey]);

  // ─── IA ─────────────────────────────────────────────────────────
  async function analisarComIA(force = false) {
    if (!mesSel || !mesAnteriorKey) {
      toast.error("Sem mês anterior para comparar");
      return;
    }
    if (!force && insightCache[mesSel]) return;
    setInsightLoading(true);
    setInsightErro(null);
    try {
      const payload = {
        mesAtual: fmtMesLabel(mesSel + "-01"),
        mesAnterior: fmtMesLabel(mesAnteriorKey + "-01"),
        operacionalAtual: totaisMes.operacional,
        operacionalAnterior: mesAnterior?.operacional ?? 0,
        capexAtual: totaisMes.capex,
        media3m: media3m ?? 0,
        topAumentos: oQueMudou.aumentos,
        topQuedas: oQueMudou.quedas,
        gastosNovos: oQueMudou.novos,
        gastosSumiram: oQueMudou.sumiram,
      };
      const { data: resp, error } = await supabase.functions.invoke("analise-despesas-insights", { body: payload });
      if (error) throw error;
      if (resp?.error) throw new Error(resp.error);
      if (!resp?.insight) throw new Error("Resposta vazia");
      setInsightCache((c) => ({ ...c, [mesSel]: resp.insight }));
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setInsightErro(msg);
      toast.error(msg);
    } finally {
      setInsightLoading(false);
    }
  }

  const opAtual = totaisMes.operacional;
  const deltaOpMes = mesAnterior ? deltaPct(opAtual, mesAnterior.operacional) : null;
  const deltaOp3m = media3m ? deltaPct(opAtual, media3m) : null;

  const gruposVisiveis = chartData.grupos.filter((g) => !gruposOcultos.has(g));

  const insightAtual = mesSel ? insightCache[mesSel] : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análise de Despesas</h1>
          <p className="text-sm text-muted-foreground">Visão por competência — valor total no mês de emissão da NF</p>
        </div>
      </div>

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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
          </>
        ) : (
          <>
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

            <Card className="card-shadow border-2" style={{ borderColor: COR_CAPEX + "80", background: COR_CAPEX + "0d" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider" style={{ color: COR_CAPEX }}>
                  <Package className="h-3.5 w-3.5" /> CAPEX
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{formatBRL(totaisMes.capex)}</div>
                <p className="mt-2 text-xs text-muted-foreground">Investimentos — fora do operacional</p>
              </CardContent>
            </Card>

            <Card className="card-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Receipt className="h-3 w-3" /> Impostos
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums text-muted-foreground">{formatBRL(totaisMes.imposto)}</div>
              </CardContent>
            </Card>

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

      {/* GRÁFICO com toggle */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Evolução mensal</h2>
              <p className="text-xs text-muted-foreground">
                {modoGrafico === "empilhado"
                  ? "Operacional empilhado por grupo · CAPEX em série separada"
                  : "Tendência por grupo — clique na legenda para isolar/ocultar"}
              </p>
            </div>
            <ToggleGroup
              type="single"
              value={modoGrafico}
              onValueChange={(v) => v && setModoGrafico(v as any)}
              size="sm"
            >
              <ToggleGroupItem value="empilhado">Empilhado</ToggleGroupItem>
              <ToggleGroupItem value="tendencia">Tendência</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {modoGrafico === "empilhado" ? (
                  <BarChart data={chartData.rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <RTooltip
                      formatter={(v: any, name: any) => [formatBRL(Number(v)), name === "__capex" ? "CAPEX" : name]}
                      labelFormatter={(l) => l}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "__capex" ? "CAPEX" : v)} />
                    {mesSel && (
                      <ReferenceLine
                        x={fmtMesLabel(mesSel + "-01")}
                        stroke="#1A4A3A"
                        strokeDasharray="4 2"
                      />
                    )}
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
                ) : (
                  <LineChart data={chartData.rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: any, name: any) => [formatBRL(Number(v)), name]} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                      onClick={(o: any) => o?.value && toggleGrupoOculto(String(o.value))}
                    />
                    {mesSel && (
                      <ReferenceLine
                        x={fmtMesLabel(mesSel + "-01")}
                        stroke="#1A4A3A"
                        strokeDasharray="4 2"
                      />
                    )}
                    {chartData.grupos.map((g, i) => (
                      <Line
                        key={g}
                        dataKey={g}
                        type="monotone"
                        stroke={CORES_GRUPO[i % CORES_GRUPO.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        hide={gruposOcultos.has(g)}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MATRIZ Grupos × Meses */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Matriz Grupo × Meses</h2>
            <p className="text-xs text-muted-foreground">
              Bloco operacional. Heatmap compara cada célula com o mês anterior da mesma linha. Clique no cabeçalho de um mês para selecioná-lo.
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : matrizOp.grupos.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Sem despesas operacionais</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2 px-2 sticky left-0 bg-background z-10 w-8"></th>
                    <th className="text-left py-2 px-2 sticky left-8 bg-background z-10 min-w-[200px]">Grupo / Conta</th>
                    {meses.map((m) => (
                      <th
                        key={m}
                        onClick={() => setMesSel(m)}
                        className={`text-right py-2 px-2 cursor-pointer uppercase tracking-wider text-[10px] hover:text-foreground ${m === mesSel ? "bg-primary/10 text-primary" : ""}`}
                      >
                        {fmtMesLabel(m + "-01")}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider bg-muted/30">Média 3m</th>
                  </tr>
                </thead>
                <tbody>
                  {matrizOp.grupos.map((g) => {
                    const isOpen = expandidos.has(g.codigo);
                    const media = media3mDe(g.porMes);
                    return (
                      <Fragment key={g.codigo}>
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleGrupo(g.codigo)}>
                          <td className="py-1.5 px-2 sticky left-0 bg-background">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>
                          <td className="py-1.5 px-2 sticky left-8 bg-background font-medium">
                            <span className="text-[10px] text-muted-foreground tabular-nums mr-2">{g.codigo}</span>
                            {g.nome}
                          </td>
                          {meses.map((m, i) => {
                            const v = g.porMes[m] ?? 0;
                            const ant = i > 0 ? (g.porMes[meses[i - 1]] ?? 0) : 0;
                            const isSel = m === mesSel;
                            return (
                              <td
                                key={m}
                                title={v ? formatBRL(v) : "—"}
                                className={`text-right py-1.5 px-2 tabular-nums ${heatBg(v, ant)} ${isSel ? "outline outline-1 outline-primary/40" : ""}`}
                              >
                                {v ? fmtCompact(v) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td className="text-right py-1.5 px-2 tabular-nums bg-muted/20 font-medium">
                            {media ? fmtCompact(media) : "—"}
                          </td>
                        </tr>
                        {isOpen && g.folhasArr.map((f) => (
                          <tr key={g.codigo + "/" + f.codigo} className="bg-muted/10 border-b">
                            <td className="sticky left-0 bg-muted/10"></td>
                            <td className="py-1 px-2 pl-8 sticky left-8 bg-muted/10 text-muted-foreground">
                              <span className="tabular-nums text-[10px] mr-2">{f.codigo}</span>{f.nome}
                            </td>
                            {meses.map((m, i) => {
                              const v = f.porMes[m] ?? 0;
                              const ant = i > 0 ? (f.porMes[meses[i - 1]] ?? 0) : 0;
                              const isSel = m === mesSel;
                              return (
                                <td
                                  key={m}
                                  title={v ? formatBRL(v) : "—"}
                                  className={`text-right py-1 px-2 tabular-nums ${heatBg(v, ant)} ${isSel ? "outline outline-1 outline-primary/40" : ""}`}
                                >
                                  {v ? fmtCompact(v) : <span className="text-muted-foreground/30">—</span>}
                                </td>
                              );
                            })}
                            <td className="text-right py-1 px-2 tabular-nums bg-muted/20 text-muted-foreground">
                              {media3mDe(f.porMes) ? fmtCompact(media3mDe(f.porMes)) : "—"}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="sticky left-0 bg-background"></td>
                    <td className="py-2 px-2 sticky left-8 bg-background">Total operacional</td>
                    {meses.map((m) => {
                      const v = matrizOp.totaisPorMes[m] ?? 0;
                      const isSel = m === mesSel;
                      return (
                        <td key={m} title={formatBRL(v)} className={`text-right py-2 px-2 tabular-nums ${isSel ? "bg-primary/10 text-primary" : ""}`}>
                          {v ? fmtCompact(v) : "—"}
                        </td>
                      );
                    })}
                    <td className="text-right py-2 px-2 tabular-nums bg-muted/30">
                      {(() => {
                        const m = media3mDe(matrizOp.totaisPorMes);
                        return m ? fmtCompact(m) : "—";
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* CAPEX */}
              {matrizCapex.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: COR_CAPEX }}>
                    <Package className="h-4 w-4" /> CAPEX
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">fora do operacional</Badge>
                  </h3>
                  <table className="w-full text-xs">
                    <thead className="border-b">
                      <tr className="text-muted-foreground">
                        <th className="text-left py-2 px-2 sticky left-0 bg-background min-w-[240px]">Conta</th>
                        {meses.map((m) => (
                          <th key={m} onClick={() => setMesSel(m)} className={`text-right py-2 px-2 cursor-pointer uppercase tracking-wider text-[10px] hover:text-foreground ${m === mesSel ? "bg-primary/10 text-primary" : ""}`}>
                            {fmtMesLabel(m + "-01")}
                          </th>
                        ))}
                        <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider bg-muted/30">Média 3m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrizCapex.map((f) => (
                        <tr key={f.codigo} className="border-b">
                          <td className="py-1 px-2 sticky left-0 bg-background text-muted-foreground">
                            <span className="tabular-nums text-[10px] mr-2">{f.codigo}</span>{f.nome}
                          </td>
                          {meses.map((m, i) => {
                            const v = f.porMes[m] ?? 0;
                            const ant = i > 0 ? (f.porMes[meses[i - 1]] ?? 0) : 0;
                            const isSel = m === mesSel;
                            return (
                              <td key={m} title={v ? formatBRL(v) : "—"} className={`text-right py-1 px-2 tabular-nums ${heatBg(v, ant)} ${isSel ? "outline outline-1 outline-primary/40" : ""}`}>
                                {v ? fmtCompact(v) : <span className="text-muted-foreground/30">—</span>}
                              </td>
                            );
                          })}
                          <td className="text-right py-1 px-2 tabular-nums bg-muted/20 text-muted-foreground">
                            {media3mDe(f.porMes) ? fmtCompact(media3mDe(f.porMes)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* IMPOSTOS */}
              {matrizImpostos.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
                    <Receipt className="h-4 w-4" /> Impostos
                  </h3>
                  <table className="w-full text-xs">
                    <thead className="border-b">
                      <tr className="text-muted-foreground">
                        <th className="text-left py-2 px-2 sticky left-0 bg-background min-w-[240px]">Conta</th>
                        {meses.map((m) => (
                          <th key={m} onClick={() => setMesSel(m)} className={`text-right py-2 px-2 cursor-pointer uppercase tracking-wider text-[10px] hover:text-foreground ${m === mesSel ? "bg-primary/10 text-primary" : ""}`}>
                            {fmtMesLabel(m + "-01")}
                          </th>
                        ))}
                        <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider bg-muted/30">Média 3m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrizImpostos.map((f) => (
                        <tr key={f.codigo} className="border-b">
                          <td className="py-1 px-2 sticky left-0 bg-background text-muted-foreground">
                            <span className="tabular-nums text-[10px] mr-2">{f.codigo}</span>{f.nome}
                          </td>
                          {meses.map((m, i) => {
                            const v = f.porMes[m] ?? 0;
                            const ant = i > 0 ? (f.porMes[meses[i - 1]] ?? 0) : 0;
                            const isSel = m === mesSel;
                            return (
                              <td key={m} title={v ? formatBRL(v) : "—"} className={`text-right py-1 px-2 tabular-nums ${heatBg(v, ant)} ${isSel ? "outline outline-1 outline-primary/40" : ""}`}>
                                {v ? fmtCompact(v) : <span className="text-muted-foreground/30">—</span>}
                              </td>
                            );
                          })}
                          <td className="text-right py-1 px-2 tabular-nums bg-muted/20 text-muted-foreground">
                            {media3mDe(f.porMes) ? fmtCompact(media3mDe(f.porMes)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totaisMes.nao_classificado > 0 && (
                <div className="mt-4 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-amber-800 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Não classificado no mês: <span className="font-semibold tabular-nums">{formatBRL(totaisMes.nao_classificado)}</span>
                  </span>
                  <Button variant="link" size="sm" onClick={() => navigate("/administrativo-fetely/nfs-stage")} className="h-auto p-0 text-amber-800">
                    Revisar em NFs Stage →
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* O QUE MUDOU */}
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">O que mudou</h2>
            <p className="text-xs text-muted-foreground">
              {mesAnteriorKey
                ? `${fmtMesLabel(mesSel + "-01")} vs ${fmtMesLabel(mesAnteriorKey + "-01")} — contas folha do operacional (Δ ≥ R$ 100)`
                : "Sem mês anterior para comparar"}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ListaMovimento
              titulo="Maiores aumentos"
              icon={<TrendingUp className="h-4 w-4 text-rose-600" />}
              itens={oQueMudou.aumentos}
              vazio="Sem aumentos relevantes"
              positivo={false}
            />
            <ListaMovimento
              titulo="Maiores quedas"
              icon={<TrendingDown className="h-4 w-4 text-emerald-600" />}
              itens={oQueMudou.quedas}
              vazio="Sem quedas relevantes"
              positivo={true}
            />
            <ListaSimples
              titulo="Gastos novos"
              icon={<PlusCircle className="h-4 w-4 text-blue-600" />}
              itens={oQueMudou.novos}
              vazio="Nenhum gasto novo"
            />
            <ListaSimples
              titulo="Gastos que zeraram"
              icon={<MinusCircle className="h-4 w-4 text-muted-foreground" />}
              itens={oQueMudou.sumiram}
              vazio="Nenhum gasto zerou"
            />
          </div>
        </CardContent>
      </Card>

      {/* IA */}
      <Card className="card-shadow border-l-4" style={{ borderLeftColor: "#1A4A3A" }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "#1A4A3A" }} />
              <h2 className="text-lg font-semibold">Análise com IA</h2>
            </div>
            {insightAtual ? (
              <Button size="sm" variant="outline" onClick={() => analisarComIA(true)} disabled={insightLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${insightLoading ? "animate-spin" : ""}`} />
                Reanalisar
              </Button>
            ) : (
              <Button size="sm" onClick={() => analisarComIA(false)} disabled={insightLoading || !mesAnteriorKey}>
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Analisar mês com IA
              </Button>
            )}
          </div>
          {insightLoading ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Analisando...</p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-9/12" />
            </div>
          ) : insightErro && !insightAtual ? (
            <div className="text-sm text-destructive">
              <p className="font-medium">Falha na análise</p>
              <p className="text-xs text-muted-foreground mt-1">{insightErro}</p>
            </div>
          ) : insightAtual ? (
            <ul className="space-y-2 text-sm">
              {insightAtual
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .map((l, i) => {
                  const clean = l.replace(/^[-•*]\s*/, "");
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{clean}</span>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clique em "Analisar mês com IA" para gerar uma leitura executiva do mês selecionado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ListaMovimento({
  titulo, icon, itens, vazio, positivo,
}: { titulo: string; icon: React.ReactNode; itens: Movimento[]; vazio: string; positivo: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">{vazio}</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" title={m.nome}>{m.nome}</span>
              <span className="tabular-nums text-right shrink-0">
                <span className="font-medium">{formatBRL(m.valorAtual)}</span>
                <span className={`ml-2 ${positivo ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.delta > 0 ? "+" : ""}{formatBRL(m.delta)}
                  {m.deltaPct !== null && ` (${m.deltaPct > 0 ? "+" : ""}${fmtPct(m.deltaPct)})`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListaSimples({
  titulo, icon, itens, vazio,
}: { titulo: string; icon: React.ReactNode; itens: { nome: string; valor: number }[]; vazio: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">{vazio}</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" title={m.nome}>{m.nome}</span>
              <span className="tabular-nums font-medium shrink-0">{formatBRL(m.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
