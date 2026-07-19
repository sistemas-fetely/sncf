import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
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
              <Wallet className="h-3 w-3" />
              Saldo Consolidado
            </div>
            <div className="text-3xl font-bold tracking-tight tabular-nums leading-tight">
              {formatBRL(saldo)}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {status.mensagem}
          </div>
        </div>
        <div className="flex items-center gap-5 md:gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/60">Recebido mês</div>
            <div className="flex items-center gap-1 text-sm font-semibold text-emerald-200 tabular-nums">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {formatBRL(recebidoMes)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/60">Pago mês</div>
            <div className="flex items-center gap-1 text-sm font-semibold text-rose-200 tabular-nums">
              <ArrowDownRight className="h-3.5 w-3.5" />
              {formatBRL(pagoMes)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/60">Líquido</div>
            <div className={`text-sm font-semibold tabular-nums ${liquido >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
        .not("estagio", "in", "(faturado,entregue,cancelado)");
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
        .in("status", ["aguardando_pagamento", "aguardando_envio_bling", "aguardando_emissao_nf", "vigente", "vigente_parcial", "vencido", "vencido_suspenso", "em_juridico"]);

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

  const { data: formasData } = useQuery({
    queryKey: ["dashboard-formas-fetely"],
    queryFn: async () => {
      const hoje = new Date();
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split("T")[0];
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("forma_solicitada, valor_liquido, tipo_pagamento")
        .gte("data_pedido", ini)
        .lte("data_pedido", fim);
      const rows = data ?? [];
      const total = rows.reduce((s: number, p: any) => s + Number(p.valor_liquido ?? 0), 0);
      const porForma = new Map<string, number>();
      let aVista = 0, aPrazo = 0;
      for (const p of rows) {
        const f = p.forma_solicitada ?? "outro";
        porForma.set(f, (porForma.get(f) ?? 0) + Number(p.valor_liquido ?? 0));
        if (p.tipo_pagamento === "a_vista") aVista += Number(p.valor_liquido ?? 0);
        else if (p.tipo_pagamento === "a_prazo") aPrazo += Number(p.valor_liquido ?? 0);
      }
      const formas = Array.from(porForma.entries())
        .map(([forma, valor]) => ({ forma, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
        .sort((a, b) => b.valor - a.valor);
      return { formas, total, aVista, aPrazo };
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
    const pagasUltimosTresMesesArr = realizadas
      .filter((c: any) => c.tipo === "pagar" && new Date(c.data_pagamento) >= tresMesesAtras && new Date(c.data_pagamento) < iniMesAtual);
    const pagasUltimosTresMeses = pagasUltimosTresMesesArr.reduce((s: number, c: any) => s + Number(c.valor), 0);
    const mesesComBurn = new Set(
      pagasUltimosTresMesesArr.map((c: any) => String(c.data_pagamento).slice(0, 7))
    ).size;
    const burnMedio = pagasUltimosTresMeses / 3;
    const runway = burnMedio > 0 && mesesComBurn >= 3 ? saldoBancario / burnMedio : null;

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

      {/* Vendas por forma de pagamento + DSO + À vista/A prazo */}
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
              <div className="mt-0.5 text-xs text-muted-foreground">Mês atual · % por valor</div>
              <div className="mt-4 space-y-3">
                {(formasData?.total ?? 0) === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Sem vendas no mês.</div>
                ) : (
                  (formasData?.formas ?? []).map((f) => (
                    <div key={f.forma}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corForma(f.forma) }} />
                          <span className="font-medium">{rotuloForma(f.forma)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-semibold tabular-nums">{formatBRL(f.valor)}</span>
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

            <div className="grid gap-4">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tempo médio de recebimento
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${VERDE}15` }}>
                    <Clock className="h-4 w-4" style={{ color: VERDE }} />
                  </div>
                </div>
                <div className="mt-3 text-2xl font-bold tracking-tight tabular-nums">
                  {dsoData?.dias == null ? "—" : `${dsoData.dias} dias`}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {dsoData?.dias == null ? "Sem títulos quitados ainda" : `Base: ${dsoData.amostra} títulos`}
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
                  <div className="mt-3 text-sm text-muted-foreground">Sem dados no mês.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">À vista</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tabular-nums">{formatBRL(formasData?.aVista ?? 0)}</span>
                        <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pctAVista.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">A prazo</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tabular-nums">{formatBRL(formasData?.aPrazo ?? 0)}</span>
                        <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pctAPrazo.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}



      {/* Linha 1 — NEGÓCIO */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Faturamento do mês"
          value={formatBRL(pedidosData?.faturamentoMes ?? 0)}
          delta={
            (pedidosData?.faturamentoMesAnterior ?? 0) > 0
              ? { valor: deltaPercent(pedidosData?.faturamentoMes ?? 0, pedidosData?.faturamentoMesAnterior ?? 0) ?? 0, rotulo: "vs. mês anterior" }
              : null
          }
          icon={TrendingUp}
          accent={VERDE}
        />
        <MetricCard
          label="Pedidos faturados"
          value={String(pedidosData?.pedidosFaturadosMes ?? 0)}
          sub={`Ticket médio ${formatBRL(pedidosData?.ticketMedio ?? 0)}`}
          icon={CheckCircle2}
          accent={VERDE}
        />
        <MetricCard
          label="Pipeline em aberto"
          value={formatBRL(pedidosData?.pipelineValor ?? 0)}
          sub={`${pedidosData?.pipelineCount ?? 0} pedidos no funil`}
          icon={Activity}
          accent={AZUL}
        />
        <MetricCard
          label="Desconto médio"
          value={`${(pedidosData?.descontoMedioMes ?? 0).toFixed(1)}%`}
          sub="Concedido nos pedidos do mês"
          icon={ArrowDownRight}
          accent={AMBAR}
        />
      </div>

      {/* Linha 2 — CAIXA & RECEBÍVEIS */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          value={formatBRL(metrics.aVencerValor)}
          sub={`${metrics.aVencerCount} compromissos`}
          icon={Clock}
          accent={AMBAR}
        />
        <MetricCard
          label="Fôlego de Caixa"
          value={metrics.runway === null ? "—" : `${metrics.runway.toFixed(1)} meses`}
          sub={metrics.runway === null ? "Sem histórico suficiente" : `Burn médio: ${formatBRL(metrics.burnMedio)}`}
          icon={Activity}
          accent={VERDE}
          alert={metrics.runway !== null && metrics.runway < 6}
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

