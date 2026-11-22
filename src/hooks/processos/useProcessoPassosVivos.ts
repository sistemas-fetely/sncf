import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessoPassoVivo {
  passo_id: string;
  processo_id: string;
  ordem: number | null;
  codigo: string | null;
  trecho: string | null;
  canal: string | null;
  fato_inicio: string | null;
  fato_fim: string | null;
  area_id: string | null;
  area_nome: string | null;
  automatico: boolean | null;
  regra_prazo_codigo: string | null;
  prazo_valor: number | null;
  prazo_unidade: string | null;
  prazo_conta_de: string | null;
  prazo_definido_por: string | null;
  prazo_definido_em: string | null;
  tarefas_abertas: number | null;
}

export function passoDoMotor(passo: ProcessoPassoVivo | undefined) {
  return passo?.codigo != null;
}

export function useProcessoPassosVivos(processoId: string) {
  return useQuery({
    queryKey: ["processos", "passos-vivos", processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<Map<string, ProcessoPassoVivo>> => {
      const { data, error } = await supabase
        .from("vw_processo_passo_vivo" as never)
        .select("*")
        .eq("processo_id", processoId);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as ProcessoPassoVivo[]).map((p) => [p.passo_id, p]));
    },
  });
}