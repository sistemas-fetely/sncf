import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Receipt, CheckSquare, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

const dataFormatada = () =>
  new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  error,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-colors hover:border-gold/40">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[2px] text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="font-display text-4xl text-foreground leading-none mb-2">
        {loading ? (
          <span className="inline-block h-8 w-12 rounded bg-muted animate-pulse" />
        ) : error ? (
          "—"
        ) : (
          value
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function CasaHome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // KPI 1: CPRs aguardando aprovação
  const kpiCPRs = useQuery({
    queryKey: ["casa-kpi-cprs-aguardando"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contas_pagar_receber")
        .select("*", { count: "exact", head: true })
        .eq("status", "aguardando");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // KPI 2: Tarefas do dia
  const kpiTarefas = useQuery({
    queryKey: ["casa-kpi-tarefas-hoje", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { count, error } = await supabase
        .from("sncf_tarefas")
        .select("*", { count: "exact", head: true })
        .eq("responsavel_user_id", user!.id)
        .neq("status", "concluida")
        .neq("status", "cancelada")
        .or(`prazo_data.lte.${hoje},prazo_data.is.null`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const primeiroNome = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 animate-casa-fade-in">
      {/* Saudação */}
      <div className="mb-10 md:mb-14">
        <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground mb-2">
          {saudacao()}
        </p>
        <h1 className="font-display text-4xl md:text-6xl text-foreground leading-tight">
          {primeiroNome ? (
            <>
              Bem-vindo, <span className="text-gold italic">{primeiroNome}</span>
            </>
          ) : (
            <>
              Bem-vindo à <span className="text-gold italic">Casa Fetély</span>
            </>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-3">
          sua casa hoje · {dataFormatada()}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <KpiCard
          label="CPRs"
          value={kpiCPRs.data ?? 0}
          hint="aguardando aprovação"
          icon={Receipt}
          loading={kpiCPRs.isLoading}
          error={kpiCPRs.isError}
        />
        <KpiCard
          label="Tarefas"
          value={kpiTarefas.data ?? 0}
          hint="pendentes hoje"
          icon={CheckSquare}
          loading={kpiTarefas.isLoading}
          error={kpiTarefas.isError}
        />
        <KpiCard
          label="Caixa"
          value="—"
          hint="em breve · agregação Fase 1"
          icon={Wallet}
          loading={false}
          error={false}
        />
      </div>

      {/* CTAs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        <button
          type="button"
          onClick={() => navigate("/administrativo")}
          className="casa-aurora-group group relative overflow-hidden text-left p-6 md:p-7 rounded-xl gold-border gold-border-hover bg-card transition-shadow"
        >
          <span className="casa-aurora" aria-hidden="true" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[2px] text-gold mb-2">Começar</p>
            <h2 className="font-display text-2xl md:text-3xl text-foreground mb-2">
              Abrir Operação Financeira
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Contas a pagar, conciliação, fluxo. Tudo que precisa de mão hoje.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm text-gold group-hover:gap-2.5 transition-all">
              Entrar <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/tarefas")}
          className="group text-left p-6 md:p-7 rounded-xl gold-border gold-border-hover bg-card transition-shadow"
        >
          <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-2">
            Em andamento
          </p>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-2">Tarefas</h2>
          <div className="font-display text-5xl text-gold leading-none mb-1">
            {kpiTarefas.isLoading ? "…" : kpiTarefas.data ?? 0}
          </div>
          <p className="text-sm text-muted-foreground">pendentes</p>
        </button>
      </div>

      {/* Mural Fetely placeholder */}
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
        <p className="text-[10px] uppercase tracking-[2px] text-gold mb-2">Mural Fetely</p>
        <h3 className="font-display text-2xl text-foreground mb-3">A vida da casa</h3>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Aqui vai morar o feed humano da Fetély: aniversariantes, conquistas, posts internos,
          Fala Fetely em destaque. Em construção — vai chegar logo.
        </p>
      </div>
    </div>
  );
}
