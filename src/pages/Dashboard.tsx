import { useMemo, useState } from "react";
import {
  Users, Briefcase, Calendar, AlertTriangle, FileText, CreditCard, Gift,
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Minus,
  Building2, Clock, Lightbulb,
} from "lucide-react";
import InsightsIA from "@/components/dashboard/InsightsIA";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SugestoesInboxDialog, type SugestaoItem } from "@/components/dashboard/SugestoesInboxDialog";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativos", inativo: "Inativos", ferias: "Férias",
  afastado: "Afastados", desligado: "Desligados",
};
const STATUS_COLORS: Record<string, string> = {
  ativo: "hsl(142, 72%, 35%)", inativo: "hsl(0, 0%, 60%)",
  ferias: "hsl(200, 80%, 50%)", afastado: "hsl(32, 95%, 50%)",
  desligado: "hsl(0, 70%, 50%)",
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function calcVariation(atual: number, anterior: number) {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

function VariationBadge({ atual, anterior, invertColor }: { atual: number; anterior: number; invertColor?: boolean }) {
  const variation = calcVariation(atual, anterior);
  const isUp = variation > 0;
  const isNeutral = variation === 0;
  const colorClass = isNeutral
    ? "text-muted-foreground"
    : invertColor
      ? (isUp ? "text-destructive" : "text-success")
      : (isUp ? "text-success" : "text-destructive");

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", colorClass)}>
      {isNeutral ? <Minus className="h-3 w-3" /> : isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(variation).toFixed(1)}%
    </span>
  );
}

function FinancialKpiCard({
  title, valorAtual, valorAnterior, icon: Icon, invertColor, subtitle,
}: {
  title: string; valorAtual: number; valorAnterior: number;
  icon: React.ElementType; invertColor?: boolean; subtitle?: string;
}) {
  return (
    <Card className="card-shadow border animate-fade-in">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className="text-xl font-bold tracking-tight">{formatBRL(valorAtual)}</p>
            <div className="flex items-center gap-2">
              <VariationBadge atual={valorAtual} anterior={valorAnterior} invertColor={invertColor} />
              <span className="text-xs text-muted-foreground">vs mês anterior</span>
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const tooltipStyle = { borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 };

interface VelocidadeMetrica {
  tempoMedioPreenchimento: number;
  totalConvitesComMetrica: number;
  insightsData: {
    convitesPendentes: number;
    onboardingsAtrasados: number;
    vagasAbertas: number;
    candidatosTriagem: number;
    contratosVencendo: number;
    tarefasBloqueantes: number;
    tempoMedioContratacao: number;
  };
}

function VelocidadeInsightsSection() {
  const [data, setData] = useState<VelocidadeMetrica | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const hojeStr = new Date().toISOString().slice(0, 10);
      const em30d = new Date();
      em30d.setDate(em30d.getDate() + 30);
      const em30dStr = em30d.toISOString().slice(0, 10);

      const [convitesRes, tarefasRes, vagasRes, candidatosRes, contratosVencRes] = await Promise.all([
        supabase.from("convites_cadastro").select("id, status, created_at, preenchido_em"),
        supabase.from("vw_tarefas").select("id, status, prazo_data, bloqueante, esta_aberta, esta_atrasada").eq("tipo_processo", "onboarding").eq("esta_aberta", true),
        supabase.from("vagas" as any).select("id").eq("status", "aberta"),
        supabase.from("candidatos").select("id, status").in("status", ["recebido", "triagem", "entrevista"]),
        supabase.from("contratos_pj").select("id").eq("status", "ativo").not("data_fim", "is", null).gte("data_fim", hojeStr).lte("data_fim", em30dStr),
      ]);
      if (cancelled) return;

      const convites = convitesRes.data || [];
      const tarefasOnb = tarefasRes.data || [];
      const candidatos = candidatosRes.data || [];

      const convitesPreenchidos = convites.filter((c: any) => c.preenchido_em && c.created_at);
      const tempos = convitesPreenchidos.map((c: any) =>
        (new Date(c.preenchido_em).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const tempoMedio = tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;

      const tarefasAtrasadas = tarefasOnb.filter((t: any) => t.esta_atrasada);

      setData({
        tempoMedioPreenchimento: tempoMedio,
        totalConvitesComMetrica: convitesPreenchidos.length,
        insightsData: {
          convitesPendentes: convites.filter((c: any) => ["pendente", "email_enviado"].includes(c.status)).length,
          onboardingsAtrasados: tarefasAtrasadas.length,
          vagasAbertas: (vagasRes.data || []).length,
          candidatosTriagem: candidatos.filter((c: any) => c.status === "recebido").length,
          contratosVencendo: (contratosVencRes.data || []).length,
          tarefasBloqueantes: tarefasAtrasadas.filter((t: any) => t.bloqueante).length,
          tempoMedioContratacao: Math.round(tempoMedio),
        },
      });
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.totalConvitesComMetrica >= 5 && (
        <div>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">
            Velocidade operacional
          </h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            <Card className="card-shadow animate-fade-in">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold">{data.tempoMedioPreenchimento.toFixed(1)} dias</p>
                    <p className="text-xs text-muted-foreground">Tempo médio de preenchimento de convite</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Baseado em {data.totalConvitesComMetrica} convites
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <InsightsIA {...data.insightsData} />
    </div>
  );
}


function DashboardGestao() {
  const {
    clt, pj, headcount, ferias, aniversariantes,
    statusClt, turnover, folha, nfPendentes, pagPjPendentes,
    experienciaVencendo, docsVencendo, aniversariosEmpresa, semBeneficio,
    contratosPendentes, convitesPreenchidos, custoPj, custoEvolucao, custoDept, salarioMedio,
    sugestoesPendentes, agregadosExcluemClevel,
    mesAtualLabel,
    isLoading,
  } = useDashboardData();
  const { isSuperAdmin } = usePermissions();
  const [sugestoesOpen, setSugestoesOpen] = useState(false);

  const statusData = useMemo(() => Object.entries(statusClt).map(([status, value]) => ({
    name: STATUS_LABELS[status] || status, value,
    color: STATUS_COLORS[status] || "hsl(215, 70%, 50%)",
  })), [statusClt]);

  const folhaAtual = folha.atual;
  const folhaAnterior = folha.anterior;

  // Se a folha atual está aberta e zerada, usar salário base como estimativa
  const folhaAtualBrutoEncargos = folhaAtual ? Number(folhaAtual.total_bruto || 0) + Number(folhaAtual.total_encargos || 0) : 0;
  const folhaAnteriorBrutoEncargos = folhaAnterior ? Number(folhaAnterior.total_bruto || 0) + Number(folhaAnterior.total_encargos || 0) : 0;

  const custoTotalCltAtual = folhaAtualBrutoEncargos > 0
    ? folhaAtualBrutoEncargos
    : folhaAnteriorBrutoEncargos > 0
      ? folhaAnteriorBrutoEncargos
      : salarioMedio.total;

  const custoTotalCltAnterior = folhaAtualBrutoEncargos > 0
    ? folhaAnteriorBrutoEncargos
    : folhaAnteriorBrutoEncargos > 0
      ? (folha.anterior2 ? Number(folha.anterior2.total_bruto || 0) + Number(folha.anterior2.total_encargos || 0) : 0)
      : 0;

  const custoTotalMes = custoTotalCltAtual + custoPj.totalAtual;
  const custoTotalMesAnterior = custoTotalCltAnterior + custoPj.totalAnterior;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Alertas
  type Alerta = {
    titulo: string;
    detalhe: string;
    prioridade: "alta" | "media" | "baixa";
    tipo?: "sugestao";
    onClick?: () => void;
  };
  const alertas: Alerta[] = [];
  if (ferias.periodoVencido > 0) alertas.push({ titulo: `${ferias.periodoVencido} período(s) de férias vencido(s)`, detalhe: "Saldo pendente", prioridade: "alta" });
  if (pj.vencendo > 0) alertas.push({ titulo: `${pj.vencendo} contrato(s) PJ vencendo`, detalhe: "Próximos 30 dias", prioridade: "alta" });
  if (nfPendentes > 0) alertas.push({ titulo: `${nfPendentes} nota(s) fiscal(is) pendente(s)`, detalhe: "Aguardando processamento", prioridade: "media" });
  if (pagPjPendentes > 0) alertas.push({ titulo: `${pagPjPendentes} pagamento(s) PJ pendente(s)`, detalhe: "Aguardando pagamento", prioridade: "media" });
  if (folhaAtual && folhaAtual.status === "aberta") alertas.push({ titulo: `Folha ${folhaAtual.competencia} em aberto`, detalhe: "Fechar folha", prioridade: "media" });
  experienciaVencendo.forEach((e) => {
    alertas.push({ titulo: `${e.nome} — experiência ${e.marco} dias`, detalhe: e.diasRestantes > 0 ? `${e.diasRestantes} dia(s) restante(s) · ${e.depto}` : `Vence hoje · ${e.depto}`, prioridade: "alta" });
  });
  docsVencendo.forEach((d) => {
    alertas.push({ titulo: `${d.documento} de ${d.nome} ${d.vencido ? "vencida" : "vencendo"}`, detalhe: `Validade: ${new Date(d.validade + "T00:00:00").toLocaleDateString("pt-BR")} · ${d.depto}`, prioridade: d.vencido ? "alta" : "media" });
  });
  aniversariosEmpresa.forEach((a) => {
    alertas.push({ titulo: `${a.nome} completa ${a.anos} ano(s) de empresa`, detalhe: `${a.data} · ${a.depto}`, prioridade: "baixa" });
  });
  if (semBeneficio.length > 0) {
    alertas.push({ titulo: `${semBeneficio.length} colaborador(es) sem benefícios`, detalhe: semBeneficio.slice(0, 3).map((s) => s.nome).join(", ") + (semBeneficio.length > 3 ? "..." : ""), prioridade: "media" });
  }
  if (contratosPendentes.length > 0) {
    alertas.push({ titulo: `${contratosPendentes.length} contrato(s) PJ pendente(s) de assinatura`, detalhe: contratosPendentes.slice(0, 3).map((c) => c.nome).join(", ") + (contratosPendentes.length > 3 ? "..." : ""), prioridade: "alta" });
  }
  if (convitesPreenchidos.length > 0) {
    alertas.push({ titulo: `${convitesPreenchidos.length} cadastro(s) preenchido(s) aguardando aprovação`, detalhe: convitesPreenchidos.slice(0, 3).map((c) => `${c.nome} (${c.tipo.toUpperCase()})`).join(", ") + (convitesPreenchidos.length > 3 ? "..." : ""), prioridade: "alta" });
  }
  if (sugestoesPendentes.length > 0) {
    const primeira = sugestoesPendentes[0] as any;
    alertas.push({
      titulo: `${sugestoesPendentes.length} sugestão(ões) pendente(s) de avaliação`,
      detalhe: primeira.titulo_sugerido || (primeira.descricao || "").slice(0, 80),
      prioridade: "media",
      tipo: "sugestao",
      onClick: () => setSugestoesOpen(true),
    });
  }

  const prioridadeStyles: Record<string, string> = {
    alta: "bg-destructive/10 text-destructive border-0",
    media: "bg-warning/10 text-warning border-0",
    baixa: "bg-info/10 text-info border-0",
  };

  const headcountTotal = clt.ativos + pj.ativos;

  return (
    <div className="space-y-6">
      {alertas.filter((a) => a.prioridade === "alta").length > 0 && (
        <div className="flex justify-end">
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-0 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {alertas.filter((a) => a.prioridade === "alta").length} alerta(s) crítico(s)
          </Badge>
        </div>
      )}

      {/* Row 1: Financial KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <FinancialKpiCard
          title="Custo Total Mensal"
          valorAtual={custoTotalMes}
          valorAnterior={custoTotalMesAnterior}
          icon={DollarSign}
          invertColor
          subtitle={agregadosExcluemClevel
            ? `CLT ${formatBRL(custoTotalCltAtual)} + PJ ${formatBRL(custoPj.totalAtual)} · * C-Level excluídos`
            : `CLT ${formatBRL(custoTotalCltAtual)} + PJ ${formatBRL(custoPj.totalAtual)}`
          }
        />
        <FinancialKpiCard
          title="Folha CLT (Bruto + Encargos)"
          valorAtual={custoTotalCltAtual}
          valorAnterior={custoTotalCltAnterior}
          icon={Users}
          invertColor
          subtitle={`${folhaAtualBrutoEncargos > 0 ? (folhaAtual?.total_colaboradores || salarioMedio.count) : salarioMedio.count} colaboradores${folhaAtualBrutoEncargos === 0 ? " (estimativa)" : ""}`}
        />
        <FinancialKpiCard
          title="Custo PJ Mensal"
          valorAtual={custoPj.totalAtual}
          valorAnterior={custoPj.totalAnterior}
          icon={Briefcase}
          invertColor
          subtitle={custoPj.pendentesAtual > 0 ? `${formatBRL(custoPj.pendentesAtual)} pendente` : undefined}
        />
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Salário Médio CLT</p>
                <p className="text-xl font-bold tracking-tight">{formatBRL(salarioMedio.medio)}</p>
                <p className="text-xs text-muted-foreground">
                  {salarioMedio.count} colaboradores ativos
                  {agregadosExcluemClevel ? " · * C-Level excluídos" : ""}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Operational KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <Users className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{headcountTotal}</p>
            <p className="text-xs text-muted-foreground">Headcount Total</p>
            <p className="text-xs text-muted-foreground">{clt.ativos} CLT · {pj.ativos} PJ</p>
          </CardContent>
        </Card>
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-info/10 text-info mb-2">
              <Briefcase className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{clt.experiencia}</p>
            <p className="text-xs text-muted-foreground">Em Experiência</p>
          </CardContent>
        </Card>
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-success/10 text-success mb-2">
              <Calendar className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{ferias.emGozo}</p>
            <p className="text-xs text-muted-foreground">Férias em Gozo</p>
            {ferias.programadas > 0 && <p className="text-xs text-muted-foreground">{ferias.programadas} programadas</p>}
          </CardContent>
        </Card>
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-warning/10 text-warning mb-2">
              <FileText className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{nfPendentes}</p>
            <p className="text-xs text-muted-foreground">NFs Pendentes</p>
          </CardContent>
        </Card>
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className={cn("flex h-8 w-8 mx-auto items-center justify-center rounded-lg mb-2", pagPjPendentes > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
              <CreditCard className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{pagPjPendentes}</p>
            <p className="text-xs text-muted-foreground">Pgto PJ Pendentes</p>
          </CardContent>
        </Card>
        <Card className="card-shadow border animate-fade-in">
          <CardContent className="p-4 text-center">
            <div className={cn("flex h-8 w-8 mx-auto items-center justify-center rounded-lg mb-2", pj.vencendo > 0 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{pj.vencendo}</p>
            <p className="text-xs text-muted-foreground">Contratos Vencendo</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Evolução de Custos */}
        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Evolução de Custos (6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {custoEvolucao.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={custoEvolucao}>
                  <defs>
                    <linearGradient id="colorClt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPj" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatBRL(value)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="clt" name="CLT" stroke="hsl(var(--chart-1))" fill="url(#colorClt)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pj" name="PJ" stroke="hsl(var(--chart-4))" fill="url(#colorPj)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">Sem dados de custos disponíveis</div>
            )}
          </CardContent>
        </Card>

        {/* Custo por Departamento */}
        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Custo Mensal por Departamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {custoDept.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={custoDept} layout="vertical" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="dept" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatBRL(value)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="clt" name="CLT" fill="hsl(var(--chart-1))" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pj" name="PJ" fill="hsl(var(--chart-4))" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Headcount & Turnover */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Headcount por Departamento</CardTitle>
          </CardHeader>
          <CardContent>
            {headcount.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={headcount} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="dept" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="clt" name="CLT" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pj" name="PJ" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">Nenhum dado disponível</div>
            )}
          </CardContent>
        </Card>

        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Admissões vs Desligamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {turnover.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={turnover}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="admissoes" name="Admissões" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="desligamentos" name="Desligamentos" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">Nenhum dado disponível</div>
            )}
          </CardContent>
        </Card>

        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status dos Colaboradores</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value">
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
          {statusData.length > 0 && (
            <div className="px-6 pb-4 flex flex-wrap gap-3">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-medium">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Velocidade + Insights IA */}
      <VelocidadeInsightsSection />

      {/* Row 5: Alerts & Birthdays */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Alertas e Pendências
              {alertas.length > 0 && (
                <Badge variant="outline" className="ml-auto bg-muted text-muted-foreground border-0 text-xs">
                  {alertas.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[320px] overflow-y-auto">
            {alertas.length > 0 ? (
              alertas
                .sort((a, b) => {
                  const order = { alta: 0, media: 1, baixa: 2 };
                  return order[a.prioridade] - order[b.prioridade];
                })
                .map((t, i) => {
                  const clickable = !!t.onClick;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-3",
                        clickable && "cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors"
                      )}
                      onClick={t.onClick}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (clickable && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          t.onClick?.();
                        }
                      }}
                    >
                      {t.tipo === "sugestao" ? (
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      ) : (
                        <div className={cn("mt-1 h-2 w-2 rounded-full shrink-0",
                          t.prioridade === "alta" ? "bg-destructive" : t.prioridade === "media" ? "bg-warning" : "bg-info"
                        )} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.detalhe}</p>
                      </div>
                      <Badge variant="outline" className={prioridadeStyles[t.prioridade]}>
                        {t.prioridade}
                      </Badge>
                    </div>
                  );
                })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">✅ Nenhuma pendência no momento</p>
            )}
          </CardContent>
        </Card>

        <Card className="card-shadow animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-warning" />
              Aniversariantes do Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[320px] overflow-y-auto">
            {aniversariantes.length > 0 ? (
              aniversariantes.map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {a.nome.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.nome}</p>
                    <p className="text-xs text-muted-foreground">{a.depto}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{a.data}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum aniversariante este mês</p>
            )}
          </CardContent>
        </Card>
      </div>

      <SugestoesInboxDialog
        open={sugestoesOpen}
        onOpenChange={setSugestoesOpen}
        sugestoes={sugestoesPendentes as SugestaoItem[]}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">People Fetely · Visão de Gestão</p>
        </div>
      </div>
      <DashboardGestao />
    </div>
  );
}

