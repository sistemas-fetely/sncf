import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Receipt, CheckSquare, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

import { PageShell } from "@/components/layout/PageShell";
import { hojeISO } from "@/lib/data";
import { useAniversariantesDoMes } from "@/hooks/useAniversariantesDoMes";
import { usePublicacoesAtivas } from "@/hooks/useMural";

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function iniciais(nome: string): string {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function MuralFetely() {
  const { data: eventos, isLoading, isError, error } = useAniversariantesDoMes();
  const { data: publicacoes, isError: pubErro, error: pubErroObj } = usePublicacoesAtivas(20);
  const [indice, setIndice] = useState(0);

  const total = publicacoes?.length || 0;
  useEffect(() => {
    if (total <= 1) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % total), 8000);
    return () => clearInterval(id);
  }, [total]);
  useEffect(() => {
    if (indice >= total && total > 0) setIndice(0);
  }, [total, indice]);

  const atual = total > 0 ? publicacoes![Math.min(indice, total - 1)] : null;
  const lista = eventos ?? [];
  const temHoje = lista.some((e) => e.eh_hoje);
  const semNada = !isLoading && lista.length === 0 && !atual;
  const mensagemErro = isError
    ? (error as Error)?.message
    : pubErro
      ? (pubErroObj as Error)?.message
      : null;

  return (
    <div className="rounded-xl gold-border bg-card p-6 md:p-7">
      <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-2">Mural Fetely</p>
      {mensagemErro && (
        <p className="text-xs text-destructive mb-3">
          Não foi possível carregar o mural: {mensagemErro}
        </p>
      )}
      <h2 className="font-display text-2xl md:text-3xl text-foreground mb-4">
        Aniversariantes de {MESES_PT[new Date().getMonth()]}
      </h2>

      {/* Publicação ativa — destaque simples dentro do mesmo cartão */}
      {atual && (
        <div className="pb-5">
          <p className="font-display text-xl text-foreground">
            {atual.emoji ? `${atual.emoji} ` : ""}
            {atual.titulo}
          </p>
          {atual.mensagem && (
            <p className="text-sm text-muted-foreground mt-1">{atual.mensagem}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-wrap gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : semNada ? (
        <p className="text-sm text-muted-foreground">
          Nenhum aniversário este mês — mas sempre tem algo pra comemorar por aqui. 💚
        </p>
      ) : (
        <>
          {temHoje && (
            <p className="font-display text-gold mb-4">
              {lista
                .filter((e) => e.eh_hoje)
                .map((e) => `Hoje é dia de celebrar ${e.nome}!`)
                .join(" ")}
            </p>
          )}
          <div className={`flex flex-wrap gap-6 ${atual ? "border-t border-border pt-5 mt-5" : ""}`}>
            {lista.map((ev) => (
              <div key={ev.key} className="flex items-center gap-3">
                <Avatar
                  className={`h-12 w-12 shrink-0 ${ev.eh_hoje ? "ring-2 ring-gold" : ""}`}
                >
                  <AvatarImage
                    src={ev.foto_url ?? undefined}
                    alt={ev.nome}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-muted text-foreground text-sm font-medium">
                    {iniciais(ev.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm md:text-base text-foreground leading-tight">{ev.nome}</p>
                  <p
                    className={`text-xs leading-tight mt-0.5 ${ev.eh_hoje ? "text-gold" : "text-muted-foreground"}`}
                  >
                    {ev.eh_hoje ? "hoje 🎂" : `dia ${ev.dia}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
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
  const { user, profile, roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const temAcesso = (slug: string) => isSuperAdmin || (permitidas?.has(slug) ?? false);

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
      const hoje = hojeISO();
      const { count, error } = await supabase
        .from("vw_tarefas")
        .select("*", { count: "exact", head: true })
        .eq("responsavel_user_id", user!.id)
        .eq("esta_aberta", true)
        .or(`prazo_data.lte.${hoje},prazo_data.is.null`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const primeiroNome = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <PageShell className="animate-casa-fade-in">
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
        {temAcesso("tela.financeiro") && (
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
        )}

        {temAcesso("tela.tarefas") && (
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
        )}
      </div>

      {/* Mural Fetely */}
      <MuralFetely />
    </PageShell>
  );
}
