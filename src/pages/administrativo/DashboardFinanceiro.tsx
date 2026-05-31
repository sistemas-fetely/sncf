import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Line, ComposedChart,
} from "recharts";
import {
  TrendingUp, Wallet, AlertTriangle, CheckCircle2, Activity, Clock,
  Calendar, Target, ArrowUpRight, ArrowDownRight, Sparkles, Users,
  FolderTree, Zap,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";

// ─── Paleta Fetely ─────────────────────────────────────────────────
const VERDE = "#1A4A3A";
const VERDE_MED = "#2d6a52";
const ROSA = "#E91E63";
const AMBAR = "#d97706";
const AZUL = "#3b82f6";
const COR_CATEGORIAS = [VERDE, ROSA, AZUL, AMBAR, "#8b5cf6"];

// ─── Helpers ───────────────────────────────────────────────────────
function inicioMes(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function fimMes(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function mesNome(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}
function deltaPercent(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

// ─── Hero ──────────────────────────────────────────────────────────
function HeroBalance({
  saldo, recebidoMes, pagoMes, status,
}: {
  saldo: number; recebidoMes: number; pagoMes: number;
  status: { tipo: "ok" | "atencao" | "critico"; mensagem: string };
}) {
  const liquido = recebidoMes - pagoMes;
  const dotColor = {
    ok: "bg-emerald-400",
    atencao: "bg-amber-400",
    critico: "bg-rose-400",
  }[status.tipo];

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-8 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${VERDE} 0%, ${VERDE_MED} 100%)` }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }}
      />
      <div className="relative grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Wallet className="h-4 w-4" />
            Saldo Consolidado
          </div>
          <div className="mt-2 text-6xl font-bold tracking-tight tabular-nums">
            {formatBRL(saldo)}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {status.mensagem}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 self-end md:grid-cols-1">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/60">Recebido no mês</div>
            <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-emerald-200 tabular-nums">
              <ArrowUpRight className="h-4 w-4" />
              {formatBRL(recebidoMes)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-white/60">Pago no mês</div>
            <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-rose-200 tabular-nums">
              <ArrowDownRight className="h-4 w-4" />
              {formatBRL(pagoMes)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-white/60">Líquido</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${liquido >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {liquido >= 0 ? "+" : ""}{formatBRL(liquido)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MetricCard ────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, delta, icon: Icon, accent = VERDE, alert = false,
}: {
  label: string; value: string; sub?: string;
  delta?: { valor: number; rotulo: string } | null;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent?: string; alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${alert ? "border-rose-200 bg-rose-50/30" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {delta.valor >= 0 ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-rose-600" />
          )}
          <span className={`font-medium ${delta.valor >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
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
          <div className="text-sm font-semibold">{title}</div>
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
    info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", titulo: "text-blue-900", desc: "text-blue-700" },
    alerta: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", titulo: "text-amber-900", desc: "text-amber-700" },
    sucesso: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", titulo: "text-emerald-900", desc: "text-emerald-700" },
  }[tipo];
  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${cores.bg} ${cores.border}`}>
      <Icon className={`h-5 w-5 shrink-0 ${cores.icon}`} />
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${cores.titulo}`}>{titulo}</div>
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

  const { data: saldoBancario = 0 } = useQuery({
    queryKey: ["saldo-bancario-total"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("saldo_atual")
        .eq("ativo", true);
      return (data ?? []).reduce((s: number, c: any) => s + Number(c.saldo_atual ?? 0), 0);
    },
  });

  const { data: cprData } = useQuery({
    queryKey: ["dashboard-cpr"],
    queryFn: async () => {
      const hoje = new Date();
      const seteMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1).toISOString().split("T")[0];
      const em30dias = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];

      const { data: realizadas } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, tipo, valor, data_pagamento, data_vencimento, status, parceiro_id, plano_contas_id, fornecedor_cliente, descricao, parceiros_comerciais(razao_social), plano_contas:plano_contas_id(nome, codigo)")
        .gte("data_pagamento", seteMesesAtras)
        .not("data_pagamento", "is", null);

      const { data: aVencer } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, tipo, valor, data_vencimento, status, parceiro_id, descricao, parceiros_comerciais(razao_social)")
        .is("data_pagamento", null)
        .neq("status", "cancelada")
        .gte("data_vencimento", hoje.toISOString().split("T")[0])
        .lte("data_vencimento", em30dias)
        .order("data_vencimento", { ascending: true });

      const { data: atrasadas } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, tipo, valor, data_vencimento, descricao, parceiros_comerciais(razao_social)")
        .is("data_pagamento", null)
        .neq("status", "cancelada")
        .lt("data_vencimento", hoje.toISOString().split("T")[0]);

      return {
        realizadas: realizadas ?? [],
        aVencer: aVencer ?? [],
        atrasadas: atrasadas ?? [],
      };
    },
  });

  const { data: recorrenciaData } = useQuery({
    queryKey: ["dashboard-recorrencia"],
    queryFn: async () => {
      const { data: contratos } = await (supabase as any)
        .from("pasta_contratos")
        .select("id, status")
        .eq("status", "vigente");
      const vigentesCount = (contratos ?? []).length;

      const em12m = new Date(Date.now() + 365 * 86_400_000).toISOString().split("T")[0];
      const hoje = new Date().toISOString().split("T")[0];
      const { data: parcelas } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("valor")
        .gte("data_vencimento", hoje)
        .lte("data_vencimento", em12m);
      const compromisso12m = (parcelas ?? []).reduce((s: number, p: any) => s + Number(p.valor), 0);

      return { vigentesCount, compromisso12m };
    },
  });

  const { data: pedidosData } = useQuery({
    queryKey: ["dashboard-pedidos-fetely"],
    queryFn: async () => {
      const hoje = new Date();
      const iniAtual = inicioMes(hoje).toISOString();
      const fimAtual = fimMes(hoje).toISOString();
      const iniAnt = inicioMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1)).toISOString();
      const fimAnt = fimMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1)).toISOString();
      const iniAtualDate = inicioMes(hoje).toISOString().split("T")[0];
      const fimAtualDate = fimMes(hoje).toISOString().split("T")[0];

      const { data: fatAtual } = await (supabase as any)
        .from("pedidos")
        .select("valor_liquido")
        .gte("faturado_em", iniAtual)
        .lte("faturado_em", fimAtual);
      const { data: fatAnt } = await (supabase as any)
        .from("pedidos")
        .select("valor_liquido")
        .gte("faturado_em", iniAnt)
        .lte("faturado_em", fimAnt);
      const { data: pipeline } = await (supabase as any)
        .from("pedidos")
        .select("valor_liquido")
        .is("faturado_em", null)
        .in("estagio", ["em_analise_credito", "pre_faturado"]);
      const { data: descMes } = await (supabase as any)
        .from("pedidos")
        .select("desconto_pct")
        .gte("data_pedido", iniAtualDate)
        .lte("data_pedido", fimAtualDate)
        .not("desconto_pct", "is", null);

      const faturamentoMes = (fatAtual ?? []).reduce((s: number, p: any) => s + Number(p.valor_liquido ?? 0), 0);
      const faturamentoMesAnterior = (fatAnt ?? []).reduce((s: number, p: any) => s + Number(p.valor_liquido ?? 0), 0);
      const pedidosFaturadosMes = (fatAtual ?? []).length;
      const ticketMedio = pedidosFaturadosMes > 0 ? faturamentoMes / pedidosFaturadosMes : 0;
      const pipelineCount = (pipeline ?? []).length;
      const pipelineValor = (pipeline ?? []).reduce((s: number, p: any) => s + Number(p.valor_liquido ?? 0), 0);
      const descs = (descMes ?? []).map((d: any) => Number(d.desconto_pct));
      const descontoMedioMes = descs.length > 0 ? descs.reduce((a: number, b: number) => a + b, 0) / descs.length : 0;

      return {
        faturamentoMes, faturamentoMesAnterior, pedidosFaturadosMes, ticketMedio,
        pipelineCount, pipelineValor, descontoMedioMes,
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
        .is("data_pagamento", null)
        .neq("status", "pago");

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

  const metrics = useMemo(() => {
    const hoje = new Date();
    const iniMesAtual = inicioMes(hoje);
    const fimMesAtual = fimMes(hoje);
    const iniMesAnt = inicioMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1));
    const fimMesAnt = fimMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1));

    const realizadas = cprData?.realizadas ?? [];

    const pagasMesAtual = realizadas.filter(
      (c: any) => c.tipo === "pagar" && new Date(c.data_pagamento) >= iniMesAtual && new Date(c.data_pagamento) <= fimMesAtual
    );
    const pagoMes = pagasMesAtual.reduce((s: number, c: any) => s + Number(c.valor), 0);

    const pagasMesAnt = realizadas.filter(
      (c: any) => c.tipo === "pagar" && new Date(c.data_pagamento) >= iniMesAnt && new Date(c.data_pagamento) <= fimMesAnt
    );
    const pagoMesAnt = pagasMesAnt.reduce((s: number, c: any) => s + Number(c.valor), 0);

    const recebidoMes = realizadas
      .filter((c: any) => c.tipo === "receber" && new Date(c.data_pagamento) >= iniMesAtual && new Date(c.data_pagamento) <= fimMesAtual)
      .reduce((s: number, c: any) => s + Number(c.valor), 0);

    const tresMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
    const pagasUltimosTresMeses = realizadas
      .filter((c: any) => c.tipo === "pagar" && new Date(c.data_pagamento) >= tresMesesAtras && new Date(c.data_pagamento) < iniMesAtual)
      .reduce((s: number, c: any) => s + Number(c.valor), 0);
    const burnMedio = pagasUltimosTresMeses / 3;
    const runway = burnMedio > 0 ? saldoBancario / burnMedio : null;

    const aVencer = cprData?.aVencer ?? [];
    const aVencerPagar = aVencer.filter((c: any) => c.tipo === "pagar");
    const aVencerValor = aVencerPagar.reduce((s: number, c: any) => s + Number(c.valor), 0);

    const atrasadas = cprData?.atrasadas ?? [];
    const atrasadasPagar = atrasadas.filter((c: any) => c.tipo === "pagar");
    const atrasadasValor = atrasadasPagar.reduce((s: number, c: any) => s + Number(c.valor), 0);

    const evolucao: { mes: string; pago: number; recebido: number; liquido: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ini = inicioMes(d);
      const fim = fimMes(d);
      const pago = realizadas
        .filter((c: any) => c.tipo === "pagar" && new Date(c.data_pagamento) >= ini && new Date(c.data_pagamento) <= fim)
        .reduce((s: number, c: any) => s + Number(c.valor), 0);
      const receb = realizadas
        .filter((c: any) => c.tipo === "receber" && new Date(c.data_pagamento) >= ini && new Date(c.data_pagamento) <= fim)
        .reduce((s: number, c: any) => s + Number(c.valor), 0);
      evolucao.push({ mes: mesNome(d), pago, recebido: receb, liquido: receb - pago });
    }

    const catMap = new Map<string, { nome: string; valor: number }>();
    for (const c of pagasMesAtual) {
      const nome = (c as any).plano_contas?.nome || "Sem categoria";
      const cur = catMap.get(nome) ?? { nome, valor: 0 };
      cur.valor += Number(c.valor);
      catMap.set(nome, cur);
    }
    const topCategorias = Array.from(catMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 5);

    const noventaAtras = new Date(Date.now() - 90 * 86_400_000);
    const fornecMap = new Map<string, { nome: string; valor: number; qtd: number }>();
    for (const c of realizadas) {
      if ((c as any).tipo !== "pagar") continue;
      if (new Date((c as any).data_pagamento) < noventaAtras) continue;
      const nome = (c as any).parceiros_comerciais?.razao_social || (c as any).fornecedor_cliente || "Sem parceiro";
      const cur = fornecMap.get(nome) ?? { nome, valor: 0, qtd: 0 };
      cur.valor += Number((c as any).valor);
      cur.qtd += 1;
      fornecMap.set(nome, cur);
    }
    const topFornecedores = Array.from(fornecMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 5);

    let status: { tipo: "ok" | "atencao" | "critico"; mensagem: string };
    if (atrasadasPagar.length > 5 || (runway !== null && runway < 2)) {
      status = { tipo: "critico", mensagem: "Atenção crítica necessária" };
    } else if (atrasadasPagar.length > 0 || (runway !== null && runway < 6)) {
      status = { tipo: "atencao", mensagem: "Operação saudável com pontos de atenção" };
    } else {
      status = { tipo: "ok", mensagem: "Operação saudável" };
    }

    return {
      pagoMes, pagoMesAnt, recebidoMes,
      burnMedio, runway,
      aVencerValor, aVencerCount: aVencerPagar.length,
      atrasadasValor, atrasadasCount: atrasadasPagar.length,
      evolucao, topCategorias, topFornecedores,
      status,
    };
  }, [cprData, saldoBancario]);

  const TooltipChart = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md">
        <div className="mb-1 text-xs font-semibold">{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}:</span>
            <span className="font-mono font-semibold">{formatBRL(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Finanças" },
        ]}
        title="Visão Geral"
        subtitle="Visão consolidada do desempenho financeiro · atualizado agora"
      />
      <div className="space-y-6">

      <HeroBalance
        saldo={saldoBancario}
        recebidoMes={metrics.recebidoMes}
        pagoMes={metrics.pagoMes}
        status={metrics.status}
      />

      {/* Linha 1 — Saúde do Mês */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pago no mês"
          value={formatBRL(metrics.pagoMes)}
          delta={
            metrics.pagoMesAnt > 0
              ? { valor: deltaPercent(metrics.pagoMes, metrics.pagoMesAnt) ?? 0, rotulo: "vs. mês anterior" }
              : null
          }
          icon={ArrowDownRight}
          accent={ROSA}
        />
        <MetricCard
          label="A vencer (30d)"
          value={formatBRL(metrics.aVencerValor)}
          sub={`${metrics.aVencerCount} compromissos`}
          icon={Calendar}
          accent={AZUL}
        />
        <MetricCard
          label="Em atraso"
          value={formatBRL(metrics.atrasadasValor)}
          sub={`${metrics.atrasadasCount} contas vencidas`}
          icon={AlertTriangle}
          accent={AMBAR}
          alert={metrics.atrasadasCount > 0}
        />
        <MetricCard
          label="Runway"
          value={metrics.runway === null ? "—" : `${metrics.runway.toFixed(1)} meses`}
          sub={metrics.burnMedio > 0 ? `Burn médio: ${formatBRL(metrics.burnMedio)}` : "Sem histórico"}
          icon={Activity}
          accent={VERDE}
          alert={metrics.runway !== null && metrics.runway < 6}
        />
      </div>

      {/* Linha 2 — Recorrência */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="MRR"
          value={formatBRL(recorrenciaData?.mrr ?? 0)}
          sub="Receita recorrente mensal"
          icon={Zap}
          accent={VERDE}
        />
        <MetricCard
          label="ARR"
          value={formatBRL((recorrenciaData?.mrr ?? 0) * 12)}
          sub="Projeção anualizada"
          icon={TrendingUp}
          accent={VERDE_MED}
        />
        <MetricCard
          label="Compromisso 12m"
          value={formatBRL(recorrenciaData?.compromisso12m ?? 0)}
          sub="Parcelas a vencer"
          icon={Target}
          accent={AZUL}
        />
        <MetricCard
          label="Contratos vigentes"
          value={String(recorrenciaData?.vigentesCount ?? 0)}
          sub="Em execução"
          icon={Users}
          accent={ROSA}
        />
      </div>

      {/* Evolução 6 meses */}
      <ChartCard
        title="Evolução de fluxo — últimos 6 meses"
        subtitle="Pago vs. recebido, com líquido em destaque"
        icon={TrendingUp}
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={metrics.evolucao} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPago" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ROSA} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={ROSA} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReceb" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="recebido" name="Recebido" stroke={VERDE} strokeWidth={2} fill="url(#gReceb)" />
              <Area type="monotone" dataKey="pago" name="Pago" stroke={ROSA} strokeWidth={2} fill="url(#gPago)" />
              <Line type="monotone" dataKey="liquido" name="Líquido" stroke={AZUL} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Categorias + Fornecedores */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top categorias do mês"
          subtitle={metrics.topCategorias.length > 0 ? `${metrics.topCategorias.length} categorias com movimento` : "Sem dados no mês"}
          icon={FolderTree}
        >
          {metrics.topCategorias.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma despesa paga este mês</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.topCategorias}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {metrics.topCategorias.map((_, i) => (
                        <Cell key={i} fill={COR_CATEGORIAS[i % COR_CATEGORIAS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipChart />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {metrics.topCategorias.map((c, i) => {
                  const total = metrics.topCategorias.reduce((s, x) => s + x.valor, 0);
                  const pct = (c.valor / total) * 100;
                  return (
                    <div key={c.nome} className="flex items-center gap-3 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_CATEGORIAS[i % COR_CATEGORIAS.length] }} />
                      <span className="flex-1 truncate">{c.nome}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                      <span className="w-24 text-right font-mono text-xs font-semibold tabular-nums">{formatBRL(c.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top fornecedores (90 dias)"
          subtitle="Maiores beneficiários por valor pago"
          icon={Users}
        >
          {metrics.topFornecedores.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sem fornecedores no período</div>
          ) : (
            <div className="space-y-4">
              {metrics.topFornecedores.map((f) => {
                const total = metrics.topFornecedores[0].valor;
                const pct = (f.valor / total) * 100;
                return (
                  <div key={f.nome}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{f.nome}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums">{formatBRL(f.valor)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VERDE }} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{f.qtd} pagamentos</div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Insights */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: ROSA }} />
          <div className="text-sm font-semibold">Insights</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {metrics.atrasadasCount > 0 && (
            <Insight
              icon={AlertTriangle}
              tipo="alerta"
              titulo={`${metrics.atrasadasCount} conta(s) em atraso`}
              descricao={`Total de ${formatBRL(metrics.atrasadasValor)} vencido. Priorize regularização.`}
            />
          )}
          {metrics.runway !== null && metrics.runway < 6 && (
            <Insight
              icon={Activity}
              tipo="alerta"
              titulo={`Runway curto: ${metrics.runway.toFixed(1)} meses`}
              descricao="Saldo atual cobre menos de 6 meses ao burn médio dos últimos 3 meses."
            />
          )}
          {metrics.aVencerCount > 0 && (
            <Insight
              icon={Clock}
              tipo="info"
              titulo={`${metrics.aVencerCount} compromissos nos próximos 30 dias`}
              descricao={`Total de ${formatBRL(metrics.aVencerValor)} a desembolsar.`}
            />
          )}
          {(recorrenciaData?.mrr ?? 0) > 0 && (
            <Insight
              icon={Zap}
              tipo="sucesso"
              titulo={`MRR de ${formatBRL(recorrenciaData?.mrr ?? 0)}`}
              descricao={`ARR projetado: ${formatBRL((recorrenciaData?.mrr ?? 0) * 12)}.`}
            />
          )}
          {metrics.atrasadasCount === 0 && metrics.aVencerCount === 0 && (
            <Insight
              icon={CheckCircle2}
              tipo="sucesso"
              titulo="Sem pendências imediatas"
              descricao="Nenhum vencimento próximo nem atraso registrado."
            />
          )}
          {metrics.pagoMesAnt > 0 && metrics.pagoMes < metrics.pagoMesAnt && (
            <Insight
              icon={TrendingUp}
              tipo="sucesso"
              titulo="Despesas em queda"
              descricao={`Pago no mês está ${(((metrics.pagoMesAnt - metrics.pagoMes) / metrics.pagoMesAnt) * 100).toFixed(1)}% abaixo do mês anterior.`}
            />
          )}
        </div>
      </div>

      {/* Próximos compromissos */}
      {(cprData?.aVencer ?? []).filter((c: any) => c.tipo === "pagar").length > 0 && (
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
                {(cprData?.aVencer ?? [])
                  .filter((c: any) => c.tipo === "pagar")
                  .slice(0, 8)
                  .map((c: any) => {
                    const dias = Math.round((new Date(c.data_vencimento).getTime() - Date.now()) / 86_400_000);
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
                        <td className="py-3 text-right font-mono font-semibold tabular-nums">{formatBRL(c.valor)}</td>
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
  );
}

