import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_ABERTOS, type Tarefa, type TarefaStatus } from "./useTarefas";

/**
 * Minhas tarefas por PAPEL, lendo o espelho `tarefas_papeis` via vw_tarefa_meu_papel.
 * Nunca por `responsavel_id`: esse caminho só enxerga o R e deixa A/C/I invisíveis.
 */

export type Papel = "r" | "a" | "c" | "i";

export interface TarefaComPapel extends Tarefa {
  papeis: Papel[];
}

export const PAPEL_ROTULO: Record<Papel, string> = {
  r: "Faço",
  a: "Aprovo",
  c: "Consultado",
  i: "Informado",
};

/** C e I acompanham; não executam. A lista deles é somente leitura. */
export const PAPEL_SO_LEITURA: Papel[] = ["c", "i"];

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_cancelamento,natureza,na_lista_de_trabalho,conta_carga,ordem,criado_em,papeis" as const;

export type FiltroStatus = "abertas" | TarefaStatus;

export function useMinhasTarefasPapel(userId: string | undefined, filtro: FiltroStatus) {
  return useQuery({
    queryKey: ["tarefas", "meu-papel", userId, filtro],
    enabled: !!userId,
    queryFn: async (): Promise<TarefaComPapel[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("vw_tarefa_meu_papel").select(CAMPOS);
      q = filtro === "abertas" ? q.in("status", STATUS_ABERTOS) : q.eq("status", filtro);
      const { data, error } = await q
        .order("data_limite", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarefaComPapel[];
    },
  });
}

/**
 * Bloco "Respondo por" da tela Hoje: sou A e a coisa está pedindo atenção —
 * vencida, vencendo hoje, ou parada em revisão esperando meu aval.
 */
export function useRespondoPor(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "respondo-por", userId],
    enabled: !!userId,
    queryFn: async (): Promise<TarefaComPapel[]> => {
      const d = new Date();
      const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_tarefa_meu_papel")
        .select(CAMPOS)
        .contains("papeis", ["a"])
        .in("status", STATUS_ABERTOS)
        .or(`data_limite.lte.${hoje},status.eq.em_revisao`)
        .order("data_limite", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TarefaComPapel[];
    },
  });
}
