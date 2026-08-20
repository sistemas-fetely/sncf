import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KEY_GESTAO } from "./useGestaoSalas";

/** Painel de projetos — tudo já calculado em vw_gestao_painel_projeto. */

export interface PainelProjeto {
  projeto_id: string | null;
  nome: string | null;
  tipo: string | null;
  status: string | null;
  saude: string | null;
  data_fim_prevista: string | null;
  cadencia_checkin_dias: number | null;
  ultimo_checkin_em: string | null;
  ultimo_checkin_saude: string | null;
  ultimo_checkin_resumo: string | null;
  dias_sem_checkin: number | null;
  checkin_vencido: boolean | null;
  tarefas_abertas: number | null;
  tarefas_vencidas: number | null;
  tarefas_concluidas: number | null;
  riscos_abertos: number | null;
  risco_severidade_maxima: number | null;
  decisoes_vigentes: number | null;
}

export function usePainelProjetos() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "painel-projetos"],
    queryFn: async (): Promise<PainelProjeto[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_painel_projeto")
        .select("*")
        .order("checkin_vencido", { ascending: false, nullsFirst: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PainelProjeto[];
    },
  });
}
