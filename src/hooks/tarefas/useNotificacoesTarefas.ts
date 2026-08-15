import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Notificações do módulo Tarefas (F6) — tabela `notificacoes`, modulo = 'tarefas'.
 * Ninguém é notificado da própria ação: o banco já cuida disso e, por garantia,
 * o front descarta item com criado_por igual ao usuário logado.
 * E-mail é resumo diário do banco — nada de disparo por evento aqui.
 */

export interface NotificacaoTarefa {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  url: string | null;
  entidade_tipo: string | null;
  entidade_id: string | null;
  lida: boolean;
  criado_por: string | null;
  criado_em: string;
}

const CAMPOS =
  "id,tipo,titulo,corpo,url,entidade_tipo,entidade_id,lida,criado_por,criado_em" as const;

export function useNotificacoesTarefas(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "notificacoes", userId ?? "anon"],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificacaoTarefa[]> => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select(CAMPOS)
        .eq("modulo", "tarefas")
        .eq("user_id", userId!)
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as NotificacaoTarefa[]).filter((n) => n.criado_por !== userId);
    },
  });
}

export function useMarcarNotificacoesLidas(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      if (ids.length === 0) return 0;
      const { data, error } = await supabase.rpc("notificacoes_marcar_lidas", { _ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "notificacoes", userId ?? "anon"] }),
    onError: (e: Error) => toast.error(`Não foi possível marcar como lida: ${e.message}`),
  });
}

export interface PreferenciaNotificacao {
  tipo: string;
  in_app: boolean;
  email: boolean;
}

/** tipos previstos do módulo — a linha só existe no banco depois da primeira edição */
export const TIPOS_NOTIFICACAO: { tipo: string; rotulo: string; ajuda: string }[] = [
  { tipo: "tarefa_atribuida", rotulo: "Tarefa atribuída a mim", ajuda: "Quando alguém me coloca como responsável." },
  { tipo: "prazo_proximo", rotulo: "Prazo chegando", ajuda: "Aviso de tarefa que vence em breve." },
  { tipo: "prazo_estourado", rotulo: "Prazo estourado", ajuda: "Tarefa minha que passou do prazo." },
  { tipo: "comentario", rotulo: "Comentário e menção", ajuda: "Quando me citam ou comentam na minha tarefa." },
  { tipo: "aprovacao", rotulo: "Aprovação pendente", ajuda: "Quando há decisão minha esperando." },
  { tipo: "status_report", rotulo: "Status report de projeto", ajuda: "Publicação de report nos projetos que acompanho." },
];

export function usePreferenciasNotificacao(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "notificacoes-prefs", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, PreferenciaNotificacao>> => {
      const { data, error } = await supabase
        .from("notificacoes_preferencias")
        .select("tipo,in_app,email")
        .eq("user_id", userId!);
      if (error) throw error;
      const mapa: Record<string, PreferenciaNotificacao> = {};
      for (const p of (data ?? []) as PreferenciaNotificacao[]) mapa[p.tipo] = p;
      return mapa;
    },
  });
}

export function useSalvarPreferenciaNotificacao(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, in_app, email }: PreferenciaNotificacao) => {
      if (!userId) throw new Error("sem usuário logado");
      const { error } = await supabase.from("notificacoes_preferencias").upsert(
        { user_id: userId, tipo, in_app, email, atualizado_em: new Date().toISOString() },
        { onConflict: "user_id,tipo" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "notificacoes-prefs", userId ?? "anon"] }),
    onError: (e: Error) => toast.error(`Não foi possível salvar a preferência: ${e.message}`),
  });
}

/**
 * Rodadas de manutenção do módulo: geração de recorrentes e de avisos de prazo.
 * Silenciosas — não bloqueiam a tela e não avisam quando não há nada a fazer.
 */
export async function rodarManutencaoTarefas(): Promise<void> {
  try {
    const { error } = await supabase.rpc("gerar_tarefas_recorrentes");
    if (error) throw error;
  } catch {
    /* manutenção nunca bloqueia o módulo */
  }
  try {
    const { error } = await supabase.rpc("gerar_notificacoes_prazo");
    if (error) throw error;
  } catch {
    /* idem */
  }
}
