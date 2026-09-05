import { PageShell } from "@/components/layout/PageShell";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Line, ComposedChart,
} from "recharts";
import {
  TrendingUp, Wallet, AlertTriangle, CheckCircle2, Activity, Clock,
  Calendar, ArrowUpRight, ArrowDownRight, Sparkles, Users,
  FolderTree, ChevronLeft, ChevronRight, Package, Receipt, Info, CalendarDays,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { diasAte } from "@/lib/data";
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Paleta Fetely ─────────────────────────────────────────────────
const VERDE = "#1A4A3A";
const VERDE_MED = "#2d6a52";
const ROSA = "#E91E63";
const AMBAR = "#d97706";
const AZUL = "#3b82f6";
const COR_CATEGORIAS = [VERDE, ROSA, AZUL, AMBAR, "#8b5cf6"];

// ─── Helpers ───────────────────────────────────────────────────────
function mesNomeStr(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  return new Date(a, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(".", "");
}
function compDeDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function primeiroDia(comp: string) {
  return `${comp}-01`;
}
function ultimoDia(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  const d = new Date(a, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somarMeses(comp: string, n: number) {
  const [a, m] = comp.split("-").map(Number);
  return compDeDate(new Date(a, m - 1 + n, 1));
}
function deltaPercent(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
const num = (v: any) => Number(v ?? 0);

interface CompRow {
  mes: string;
  receita_faturada: number;
  pedidos_faturados: number;
  ticket_medio: number;
  desconto_medio_pct: number;
  despesa_operacional: number;
  impostos: number;
  despesa_financeira: number;
  despesa_nao_operacional: number;
  custo_mercadoria: number;
  investimento: number;
  resultado_competencia: number;
  qtd_lancamentos: number;
  qtd_nao_classificada: number;
  fora_do_eixo: number;
}

// ─── Hero competência ──────────────────────────────────────────────
function HeroCompetencia({
  comp, resultado, receita, despesa,
}: {
  comp: string; resultado: number; receita: number; despesa: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${VERDE} 0%, ${VERDE_MED} 100%)` }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }}
      />
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70">
              <TrendingUp className="h-3 w-3" />
              Resultado da competência
            </div>
            <div
              className={`text-3xl font-medium tracking-tight tabular-nums leading-tight ${
                resultado >= 0 ? "text-white" : "text-destructive"
              }`}
            >
              {formatBRL(resultado)}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${resultado >= 0 ? "bg-success" : "bg-destructive"}`} />
            {mesNomeStr(comp)}
          </div>
        </div>
        <div className="flex items-center gap-5 md:gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/60">Receita faturada</div>
            <div className="flex items-center gap-1 text-sm font-medium text-success tabular-nums">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {formatBRL(receita)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/60">Despesa operacional</div>
            <div className="flex items-center gap-1 text-sm font-medium text-destructive tabular-nums">
              <ArrowDownRight className="h-3.5 w-3.5" />
              {formatBRL(despesa)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MetricCard ────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, delta, icon: Icon, accent = VERDE, alert = false, hint,
}: {
  label: string; value: string; sub?: string;
  delta?: { valor: number; rotulo: string } | null;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent?: string; alert?: boolean; hint?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${alert ? "border-destructive/40 bg-destructive/10" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
          {hint && (
            <TooltipProvider>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help opacity-70" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px]">{hint}</TooltipContent>
              </UiTooltip>
            </TooltipProvider>
          )}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {delta.valor >= 0 ? (
            <ArrowUpRight className="h-3 w-3 text-success" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-destructive" />
          )}
          <span className={`font-medium ${delta.valor >= 0 ? "text-success" : "text-destructive"}`}>
            {delta.valor > 0 ? "+" : ""}{delta.valor.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">{delta.rotulo}</span>
        </div>
      )}
    </div>
  );
}

// ─── ChartCard ─────────────────────────────────────────────────────
function ChartCard({
  title, subtitle, children, icon: Icon,
}: {
  title: string; subtitle?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Insight ───────────────────────────────────────────────────────
function Insight({
  icon: Icon, titulo, descricao, tipo = "info",
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string; descricao: string;
  tipo?: "info" | "alerta" | "sucesso";
}) {
  const cores = {
    info: { bg: "bg-info/10", border: "border-info/40", icon: "text-info", titulo: "text-info", desc: "text-info" },
    alerta: { bg: "bg-warning/10", border: "border-warning/40", icon: "text-warning", titulo: "text-warning", desc: "text-warning" },
    sucesso: { bg: "bg-success/10", border: "border-success/40", icon: "text-success", titulo: "text-success", desc: "text-success" },
  }[tipo];
  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${cores.bg} ${cores.border}`}>
      <Icon className={`h-5 w-5 shrink-0 ${cores.icon}`} />
      <div className="min-w-0">
        <div className={`text-sm font-medium ${cores.titulo}`}>{titulo}</div>
        <div className={`mt-0.5 text-xs ${cores.desc}`}>{descricao}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
export default function DashboardFinanceiro() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const [searchParams, setSearchParams] = useSearchParams();

  // Nó 1b: quem não pode ver a Visão Geral (não tem tela.financeiro) é
  // redirecionado para a primeira tela de Finanças que puder ver. Ordem = a
  // mesma da sidebar. Se não puder ver nenhuma, o RotaGate já teria barrado.
  const podeVerVisaoGeral = isSuperAdmin || (permitidas?.has("tela.financeiro") ?? false);
  if (!podeVerVisaoGeral) {
    const primeira = [
      { rota: "/cliente", slug: "tela.cliente" },
      { rota: "/administrativo/contas-receber", slug: "tela.fin_receber" },
      { rota: "/administrativo/caixa-banco", slug: "tela.fin_movimentacoes" },
      { rota: "/administrativo/caixa-banco/contas", slug: "tela.fin_contas_bancarias" },
      { rota: "/administrativo/plano-contas", slug: "tela.fin_plano_contas" },
    ].find((t) => temPermissaoTela(t.slug, permitidas));
    return <Navigate to={primeira?.rota ?? "/sem-permissao"} replace />;
  }

  // ─── Série de competência (todos os meses da view) ───────────────
  const { data: serie = [], isLoading: serieLoading } = useQuery({
    queryKey: ["fin-competencia-mensal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_fin_competencia_mensal")
        .select("*")
        .order("mes", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        mes: String(r.mes).slice(0, 10),
        receita_faturada: num(r.receita_faturada),
        pedidos_faturados: num(r.pedidos_faturados),
        ticket_medio: num(r.ticket_medio),
        desconto_medio_pct: num(r.desconto_medio_pct),
        despesa_operacional: num(r.despesa_operacional),
        impostos: num(r.impostos),
        despesa_financeira: num(r.despesa_financeira),
        despesa_nao_operacional: num(r.despesa_nao_operacional),
        custo_mercadoria: num(r.custo_mercadoria),
        investimento: num(r.investimento),
        resultado_competencia: num(r.resultado_competencia),
        qtd_lancamentos: num(r.qtd_lancamentos),
        qtd_nao_classificada: num(r.qtd_nao_classificada),
        fora_do_eixo: num(r.fora_do_eixo),
      })) as CompRow[];
    },
  });

  const mesesDisponiveis = useMemo(
    () => serie.map((r) => r.mes.slice(0, 7)),
    [serie],
  );
  const ultimoMes = mesesDisponiveis[mesesDisponiveis.length - 1] ?? null;

  const compParam = searchParams.get("comp");
  const comp =
    compParam && mesesDisponiveis.includes(compParam) ? compParam : ultimoMes;

  const setComp = (novo: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("comp", novo);
    setSearchParams(p, { replace: true });
  };

  const idx = comp ? mesesDisponiveis.indexOf(comp) : -1;
  const linha = idx >= 0 ? serie[idx] : null;
  const linhaAnterior = idx > 0 ? serie[idx - 1] : null;
  const mesAtualStr = compDeDate(new Date());
  const podeMesAtual = mesesDisponiveis.includes(mesAtualStr);

  const evolucao = useMemo(() => {
    if (idx < 0) return [];
    return serie.slice(Math.max(0, idx - 5), idx + 1).map((r) => ({
      mes: mesNomeStr(r.mes.slice(0, 7)),
      receita: r.receita_faturada,
      despesa: r.despesa_operacional,
      resultado: r.resultado_competencia,
    }));
  }, [serie, idx]);

  // ─── Top categorias da competência (vw_despesas, sem mercadoria) ──
  const { data: topCategorias = [] } = useQuery({
    queryKey: ["fin-top-categorias", comp],
    enabled: !!comp,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_despesas")
        .select("plano_nome, plano_codigo, valor")
        .gte("competencia", primeiroDia(comp!))
        .lte("competencia", ultimoDia(comp!));
      if (error) throw error;
      const map = new Map<string, { nome: string; valor: number }>();
      for (const d of data ?? []) {
        const cod = String(d.plano_codigo ?? "");
        // exclui compra de mercadoria (estoque, não resultado)
        if (/^02\.0[1-5]/.test(cod)) continue;
        const nome = d.plano_nome || "Sem categoria";
        const cur = map.get(nome) ?? { nome, valor: 0 };
        cur.valor += num(d.valor);
        map.set(nome, cur);
      }
      return Array.from(map.values())
        .filter((c) => c.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);
    },
  });

  // ─── Top fornecedores (3 meses terminando na competência) ─────────
  const { data: topFornecedores = [] } = useQuery({
    queryKey: ["fin-top-fornecedores", comp],
    enabled: !!comp,
    queryFn: async () => {
      const ini = primeiroDia(somarMeses(comp!, -2));
      const { data, error } = await (supabase as any)
        .from("vw_despesas")
        .select("fornecedor_nome, valor")
        .gte("competencia", ini)
        .lte("competencia", ultimoDia(comp!));
      if (error) throw error;
      const map = new Map<string, { nome: string; valor: number; qtd: number }>();
      for (const d of data ?? []) {
        const nome = d.fornecedor_nome || "Sem fornecedor";
        const cur = map.get(nome) ?? { nome, valor: 0, qtd: 0 };
        cur.valor += num(d.valor);
        cur.qtd += 1;
        map.set(nome, cur);
      }
      return Array.from(map.values())
        .filter((f) => f.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);
    },
  });

  // ─── Vendas por forma / à vista x a prazo (âncora faturado_em) ────
  const { data: formasData } = useQuery({
    queryKey: ["dashboard-formas-fetely", comp],
    enabled: !!comp,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("forma_solicitada, valor_liquido, tipo_pagamento")
        .gte("faturado_em", `${primeiroDia(comp!)}T00:00:00`)
        .lte("faturado_em", `${ultimoDia(comp!)}T23:59:59`);
      const rows = data ?? [];
      const total = rows.reduce((s: number, p: any) => s + num(p.valor_liquido), 0);
      const porForma = new Map<string, number>();
      let aVista = 0, aPrazo = 0;
      for (const p of rows) {
        const f = p.forma_solicitada ?? "outro";
        porForma.set(f, (porForma.get(f) ?? 0) + num(p.valor_liquido));
        if (p.tipo_pagamento === "a_vista") aVista += num(p.valor_liquido);
        else if (p.tipo_pagamento === "a_prazo") aPrazo += num(p.valor_liquido);
      }
      const formas = Array.from(porForma.entries())
        .map(([forma, valor]) => ({ forma, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
        .sort((a, b) => b.valor - a.valor);
      return { formas, total, aVista, aPrazo };
    },
  });

  // ═══ POSIÇÃO DE HOJE (não obedece o seletor) ═══════════════════════
  const { data: saldoBancario = 0 } = useQuery({
    queryKey: ["saldo-bancario-total"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("saldo_atual")
        .eq("ativo", true);
      return (data ?? []).reduce((s: number, c: any) => s + num(c.saldo_atual), 0);
    },
  });

  const { data: cprData } = useQuery({
    queryKey: ["dashboard-cpr-posicao"],
    queryFn: async () => {
      const hoje = new Date().toISOString().split("T")[0];
      const em30dias = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];

      const { data: aVencer } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, tipo, valor, data_vencimento, status, parceiro_id, descricao, parceiros_comerciais(razao_social)")
        .is("data_pagamento", null)
        .neq("status", "cancelada")
        .gte("data_vencimento", hoje)
        .lte("data_vencimento", em30dias)
        .order("data_vencimento", { ascending: true });

      const { data: atrasadas } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, tipo, valor, data_vencimento, descricao, parceiros_comerciais(razao_social)")
        .is("data_pagamento", null)
        .neq("status", "cancelada")
        .lt("data_vencimento", hoje);

      return { aVencer: aVencer ?? [], atrasadas: atrasadas ?? [] };
    },
  });

  const { data: pipelineData } = useQuery({
    queryKey: ["dashboard-pipeline-aberto"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("valor_liquido")
        .is("faturado_em", null)
        .not("estagio", "in", "(faturado,entregue,cancelado)");
      const rows = data ?? [];
      return {
        pipelineCount: rows.length,
        pipelineValor: rows.reduce((s: number, p: any) => s + num(p.valor_liquido), 0),
      };
    },
  });

  const { data: recebiveisData } = useQuery({
    queryKey: ["dashboard-recebiveis-fetely"],
    queryFn: async () => {
      const hoje = new Date().toISOString().split("T")[0];
      const { data: abertos } = await (supabase as any)
        .from("titulo_a_receber")
        .select("valor_atual, valor_bruto, data_vencimento_atual, flag_bandeira_amarela")
        .in("status", ["aguardando_pagamento", "aberto", "aguardando_emissao_nf", "vigente", "vigente_parcial", "vencido", "vencido_suspenso", "em_juridico"]);

      let valorAReceberAVencer = 0;
      let valorEmAtraso = 0;
      let qtdBandeiraAmarela = 0;
      for (const t of abertos ?? []) {
        const v = Number(t.valor_atual ?? t.valor_bruto ?? 0);
        if (t.data_vencimento_atual && t.data_vencimento_atual < hoje) valorEmAtraso += v;
        else valorAReceberAVencer += v;
        if (t.flag_bandeira_amarela) qtdBandeiraAmarela += 1;
      }
      const totalEmAberto = valorAReceberAVencer + valorEmAtraso;
      const inadimplenciaPct = totalEmAberto > 0 ? (valorEmAtraso / totalEmAberto) * 100 : 0;

      return { valorAReceberAVencer, valorEmAtraso, totalEmAberto, inadimplenciaPct, qtdBandeiraAmarela };
    },
  });

  const { data: dsoData } = useQuery({
    queryKey: ["dashboard-dso-fetely"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("titulo_a_receber")
        .select("data_emissao_nf, data_pagamento")
        .in("status", ["pago", "pago_com_atraso", "pago_judicial"])
        .not("data_pagamento", "is", null)
        .not("data_emissao_nf", "is", null);
      const rows = data ?? [];
      if (rows.length === 0) return { dias: null as number | null, amostra: 0 };
      const soma = rows.reduce((s: number, t: any) => {
        const d = (new Date(t.data_pagamento).getTime() - new Date(t.data_emissao_nf).getTime()) / 86_400_000;
        return s + Math.max(0, d);
      }, 0);
      return { dias: Math.round(soma / rows.length), amostra: rows.length };
    },
  });

  const posicao = useMemo(() => {
    const aVencerPagar = (cprData?.aVencer ?? []).filter((c: any) => c.tipo === "pagar");
    const atrasadasPagar = (cprData?.atrasadas ?? []).filter((c: any) => c.tipo === "pagar");
    const aVencerValor = aVencerPagar.reduce((s: number, c: any) => s + num(c.valor), 0);
    const atrasadasValor = atrasadasPagar.reduce((s: number, c: any) => s + num(c.valor), 0);

    // Fôlego de caixa: saldo / despesa operacional média dos últimos 3 meses da view
    const ultimos3 = serie.slice(-3);
    const burnMedio =
      ultimos3.length === 3
        ? ultimos3.reduce((s, r) => s + r.despesa_operacional, 0) / 3
        : 0;
    const runway = burnMedio > 0 ? saldoBancario / burnMedio : null;

    return {
      aVencerValor, aVencerCount: aVencerPagar.length,
      atrasadasValor, atrasadasCount: atrasadasPagar.length,
      burnMedio, runway, aVencerPagar,
    };
  }, [cprData, saldoBancario, serie]);

  const TooltipChart = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md">
        <div className="mb-1 text-xs font-medium">{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}:</span>
            <span className="font-mono font-medium">{formatBRL(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const hojeBadge = new Date().toLocaleDateString("pt-BR");

  return (
    <PageShell className="animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Finanças" },
        ]}
        title="Visão Geral"
        subtitle={comp ? `Competência ${mesNomeStr(comp)}` : "Regime de competência"}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={idx <= 0}
              onClick={() => setComp(mesesDisponiveis[idx - 1])}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[86px] text-center text-sm font-medium tabular-nums">
              {comp ? mesNomeStr(comp) : "—"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={idx < 0 || idx >= mesesDisponiveis.length - 1}
              onClick={() => setComp(mesesDisponiveis[idx + 1])}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={!podeMesAtual || comp === mesAtualStr}
              onClick={() => setComp(mesAtualStr)}
            >
              Mês atual
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* ══════════ COMPETÊNCIA ══════════ */}
        {!comp ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            {serieLoading ? "Carregando competências…" : "Nenhuma competência disponível ainda."}
          </div>
        ) : (
          <>
            <HeroCompetencia
              comp={comp}
              resultado={linha?.resultado_competencia ?? 0}
              receita={linha?.receita_faturada ?? 0}
              despesa={linha?.despesa_operacional ?? 0}
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Receita faturada"
                value={formatBRL(linha?.receita_faturada ?? 0)}
                delta={
                  linhaAnterior && linhaAnterior.receita_faturada > 0
                    ? { valor: deltaPercent(linha?.receita_faturada ?? 0, linhaAnterior.receita_faturada) ?? 0, rotulo: "vs. mês anterior" }
                    : null
                }
                icon={TrendingUp}
                accent={VERDE}
              />
              <MetricCard
                label="Despesa operacional"
                value={formatBRL(linha?.despesa_operacional ?? 0)}
                delta={
                  linhaAnterior && linhaAnterior.despesa_operacional > 0
                    ? { valor: deltaPercent(linha?.despesa_operacional ?? 0, linhaAnterior.despesa_operacional) ?? 0, rotulo: "vs. mês anterior" }
                    : null
                }
                icon={ArrowDownRight}
                accent={ROSA}
              />
              <MetricCard
                label="Impostos"
                value={formatBRL(linha?.impostos ?? 0)}
                delta={
                  linhaAnterior && linhaAnterior.impostos > 0
                    ? { valor: deltaPercent(linha?.impostos ?? 0, linhaAnterior.impostos) ?? 0, rotulo: "vs. mês anterior" }
                    : null
                }
                icon={Receipt}
                accent={AMBAR}
              />
              <MetricCard
                label="Pedidos faturados"
                value={String(linha?.pedidos_faturados ?? 0)}
                sub={
                  (linha?.pedidos_faturados ?? 0) > 0
                    ? `Ticket médio ${formatBRL(linha?.ticket_medio ?? 0)}`
                    : "Sem faturamento no mês"
                }
                icon={CheckCircle2}
                accent={VERDE}
              />
              <MetricCard
                label="Desconto médio"
                value={
                  (linha?.pedidos_faturados ?? 0) > 0
                    ? `${(linha?.desconto_medio_pct ?? 0).toFixed(2)}%`
                    : "—"
                }
                sub="Concedido nos pedidos da competência"
                icon={ArrowDownRight}
                accent={AMBAR}
              />
              <MetricCard
                label="Compra de mercadoria"
                value={formatBRL(linha?.custo_mercadoria ?? 0)}
                sub="Não entra no resultado"
                hint="Estoque, não resultado. Vira CMV quando vende."
                icon={Package}
                accent={AZUL}
              />
            </div>

            {/* Evolução 6 meses terminando na competência */}
            <ChartCard
              title="Evolução da competência — 6 meses"
              subtitle={`Terminando em ${mesNomeStr(comp)}`}
              icon={TrendingUp}
            >
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolucao} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gDesp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ROSA} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={ROSA} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VERDE} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={VERDE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip content={<TooltipChart />} />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(v) => <span className="text-muted-foreground">{v}</span>}
                    />
                    <Area type="monotone" dataKey="receita" name="Receita faturada" stroke={VERDE} strokeWidth={2} fill="url(#gRec)" />
                    <Area type="monotone" dataKey="despesa" name="Despesa operacional" stroke={ROSA} strokeWidth={2} fill="url(#gDesp)" />
                    <Line type="monotone" dataKey="resultado" name="Resultado" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Vendas por forma de pagamento + À vista/A prazo */}
            {(() => {
              const FORMA_MAP: Record<string, { label: string; cor: string }> = {
                boleto: { label: "Boleto", cor: VERDE },
                cartao: { label: "Cartão", cor: AZUL },
                pix: { label: "Pix", cor: ROSA },
                troca_mercadoria: { label: "Troca de mercadoria", cor: AMBAR },
              };
              const rotuloForma = (f: string) =>
                FORMA_MAP[f]?.label ?? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, " ");
              const corForma = (f: string) => FORMA_MAP[f]?.cor ?? "#8b5cf6";
              const totalAV_AP = (formasData?.aVista ?? 0) + (formasData?.aPrazo ?? 0);
              const pctAVista = totalAV_AP > 0 ? ((formasData?.aVista ?? 0) / totalAV_AP) * 100 : 0;
              const pctAPrazo = totalAV_AP > 0 ? ((formasData?.aPrazo ?? 0) / totalAV_AP) * 100 : 0;
              return (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border bg-card p-5 shadow-sm md:col-span-2">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Vendas por forma de pagamento
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Faturado em {mesNomeStr(comp)} · % por valor
                    </div>
                    <div className="mt-4 space-y-3">
                      {(formasData?.total ?? 0) === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Sem vendas faturadas na competência.</div>
                      ) : (
                        (formasData?.formas ?? []).map((f) => (
                          <div key={f.forma}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corForma(f.forma) }} />
                                <span className="font-medium">{rotuloForma(f.forma)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs font-medium tabular-nums">{formatBRL(f.valor)}</span>
                                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{f.pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${f.pct}%`, backgroundColor: corForma(f.forma) }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        À vista × a prazo
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${AZUL}15` }}>
                        <Wallet className="h-4 w-4" style={{ color: AZUL }} />
                      </div>
                    </div>
                    {totalAV_AP === 0 ? (
                      <div className="mt-3 text-sm text-muted-foreground">Sem dados na competência.</div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">À vista</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium tabular-nums">{formatBRL(formasData?.aVista ?? 0)}</span>
                            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pctAVista.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">A prazo</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium tabular-nums">{formatBRL(formasData?.aPrazo ?? 0)}</span>
                            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pctAPrazo.toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Categorias + Fornecedores */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title={`Top categorias — ${mesNomeStr(comp)}`}
                subtitle="Despesa por categoria, sem compra de mercadoria"
                icon={FolderTree}
              >
                {topCategorias.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">Sem despesa classificada nesta competência</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={topCategorias}
                            dataKey="valor"
                            nameKey="nome"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                          >
                            {topCategorias.map((_, i) => (
                              <Cell key={i} fill={COR_CATEGORIAS[i % COR_CATEGORIAS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<TooltipChart />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {topCategorias.map((c, i) => {
                        const total = topCategorias.reduce((s, x) => s + x.valor, 0);
                        const pct = total > 0 ? (c.valor / total) * 100 : 0;
                        return (
                          <div key={c.nome} className="flex items-center gap-3 text-sm">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_CATEGORIAS[i % COR_CATEGORIAS.length] }} />
                            <span className="flex-1 truncate">{c.nome}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                            <span className="w-24 text-right font-mono text-xs font-medium tabular-nums">{formatBRL(c.valor)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Top fornecedores (3 competências)"
                subtitle={`${mesNomeStr(somarMeses(comp, -2))} a ${mesNomeStr(comp)}`}
                icon={Users}
              >
                {topFornecedores.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">Sem fornecedores no período</div>
                ) : (
                  <div className="space-y-4">
                    {topFornecedores.map((f) => {
                      const total = topFornecedores[0].valor;
                      const pct = total > 0 ? (f.valor / total) * 100 : 0;
                      return (
                        <div key={f.nome}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="truncate font-medium">{f.nome}</span>
                            <span className="font-mono text-xs font-medium tabular-nums">{formatBRL(f.valor)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VERDE }} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{f.qtd} lançamentos</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Insights da competência */}
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: ROSA }} />
                <div className="text-sm font-medium">Insights da competência</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(linha?.resultado_competencia ?? 0) < 0 && (
                  <Insight
                    icon={AlertTriangle}
                    tipo="alerta"
                    titulo={`Resultado negativo em ${mesNomeStr(comp)}`}
                    descricao={`A competência fechou em ${formatBRL(linha?.resultado_competencia ?? 0)}. Despesa operacional de ${formatBRL(linha?.despesa_operacional ?? 0)} contra receita de ${formatBRL(linha?.receita_faturada ?? 0)}.`}
                  />
                )}
                {linhaAnterior && linhaAnterior.despesa_operacional > 0 && (linha?.despesa_operacional ?? 0) > linhaAnterior.despesa_operacional && (
                  <Insight
                    icon={ArrowUpRight}
                    tipo="alerta"
                    titulo="Despesa acima do mês anterior"
                    descricao={`Despesa operacional subiu ${(deltaPercent(linha?.despesa_operacional ?? 0, linhaAnterior.despesa_operacional) ?? 0).toFixed(1)}% em relação a ${mesNomeStr(linhaAnterior.mes.slice(0, 7))}.`}
                  />
                )}
                {linhaAnterior && linhaAnterior.despesa_operacional > 0 && (linha?.despesa_operacional ?? 0) < linhaAnterior.despesa_operacional && (
                  <Insight
                    icon={TrendingUp}
                    tipo="sucesso"
                    titulo="Despesa em queda"
                    descricao={`Despesa operacional está ${(((linhaAnterior.despesa_operacional - (linha?.despesa_operacional ?? 0)) / linhaAnterior.despesa_operacional) * 100).toFixed(1)}% abaixo de ${mesNomeStr(linhaAnterior.mes.slice(0, 7))}.`}
                  />
                )}
                {posicao.atrasadasCount > 0 && (
                  <Insight
                    icon={AlertTriangle}
                    tipo="alerta"
                    titulo={`${posicao.atrasadasCount} conta(s) em atraso hoje`}
                    descricao={`Total de ${formatBRL(posicao.atrasadasValor)} vencido. Priorize regularização.`}
                  />
                )}
                {(linha?.custo_mercadoria ?? 0) > 0 && (
                  <Insight
                    icon={Package}
                    tipo="info"
                    titulo={`${formatBRL(linha?.custo_mercadoria ?? 0)} em compra de mercadoria`}
                    descricao="Entrou como estoque, não como resultado. Vira CMV quando vende."
                  />
                )}
                {(linha?.qtd_lancamentos ?? 0) === 0 && (
                  <Insight
                    icon={CheckCircle2}
                    tipo="info"
                    titulo="Competência sem lançamentos"
                    descricao="Nenhum lançamento registrado neste mês."
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* ══════════ POSIÇÃO DE HOJE ══════════ */}
        <div className="rounded-2xl border bg-muted/20 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4" style={{ color: VERDE }} />
                Posição de hoje
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Não muda com a competência selecionada — é a foto de agora.
              </div>
            </div>
            <Badge variant="outline" className="tabular-nums">{hojeBadge}</Badge>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Saldo consolidado"
                value={formatBRL(saldoBancario)}
                sub="Contas bancárias ativas"
                icon={Wallet}
                accent={VERDE}
              />
              <MetricCard
                label="A receber (a vencer)"
                value={formatBRL(recebiveisData?.valorAReceberAVencer ?? 0)}
                sub="Títulos em aberto"
                icon={Calendar}
                accent={VERDE}
              />
              <MetricCard
                label="Inadimplência"
                value={`${(recebiveisData?.inadimplenciaPct ?? 0).toFixed(1)}%`}
                sub={
                  `${formatBRL(recebiveisData?.valorEmAtraso ?? 0)} em atraso` +
                  ((recebiveisData?.qtdBandeiraAmarela ?? 0) > 0
                    ? ` · ${recebiveisData?.qtdBandeiraAmarela} bandeira amarela`
                    : "")
                }
                icon={AlertTriangle}
                accent={ROSA}
                alert={(recebiveisData?.inadimplenciaPct ?? 0) > 10}
              />
              <MetricCard
                label="A pagar (30d)"
                value={formatBRL(posicao.aVencerValor)}
                sub={`${posicao.aVencerCount} compromissos`}
                icon={Clock}
                accent={AMBAR}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Pipeline em aberto"
                value={formatBRL(pipelineData?.pipelineValor ?? 0)}
                sub={`${pipelineData?.pipelineCount ?? 0} pedidos no funil`}
                icon={Activity}
                accent={AZUL}
              />
              <MetricCard
                label="Fôlego de caixa"
                value={posicao.runway === null ? "—" : `${posicao.runway.toFixed(1)} meses`}
                sub={posicao.runway === null ? "Sem histórico suficiente" : `Despesa média: ${formatBRL(posicao.burnMedio)}`}
                icon={Activity}
                accent={VERDE}
                alert={posicao.runway !== null && posicao.runway < 6}
              />
              <MetricCard
                label="Tempo médio de recebimento"
                value={dsoData?.dias == null ? "—" : `${dsoData.dias} dias`}
                sub={dsoData?.dias == null ? "Sem títulos quitados ainda" : `Base: ${dsoData.amostra} títulos`}
                icon={Clock}
                accent={VERDE}
              />
            </div>

            {posicao.aVencerPagar.length > 0 && (
              <ChartCard
                title="Próximos compromissos"
                subtitle="Contas a pagar nos próximos 30 dias"
                icon={Calendar}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Vencimento</th>
                        <th className="pb-2 font-medium">Parceiro</th>
                        <th className="pb-2 font-medium">Descrição</th>
                        <th className="pb-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posicao.aVencerPagar.slice(0, 8).map((c: any) => {
                        const dias = diasAte(c.data_vencimento) ?? 0;
                        return (
                          <tr
                            key={c.id}
                            className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                            onClick={() => navigate("/administrativo/contas-pagar")}
                          >
                            <td className="py-3">
                              <div className="font-medium">{formatDateBR(c.data_vencimento)}</div>
                              <div className="text-xs text-muted-foreground">em {dias} dias</div>
                            </td>
                            <td className="py-3">{c.parceiros_comerciais?.razao_social ?? "—"}</td>
                            <td className="py-3 max-w-xs truncate text-muted-foreground">{c.descricao}</td>
                            <td className="py-3 text-right font-mono font-medium tabular-nums">{formatBRL(c.valor)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
