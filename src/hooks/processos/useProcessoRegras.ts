import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessoRegraHistorico {
  regra_id: string;
  valor: number | null;
  unidade: string | null;
  valor_texto: string | null;
  conta_a_partir_de: string | null;
  definido_por: string | null;
  definido_em: string | null;
  motivo: string | null;
  substituido_em: string | null;
}

export interface ProcessoRegra extends Omit<ProcessoRegraHistorico, "regra_id" | "substituido_em"> {
  id: string;
  codigo: string;
  processo_id: string;
  nome: string;
  unidade_rotulo: string | null;
  ativo: boolean;
  updated_at: string | null;
  passos: string | null;
  mudancas: number;
}

export const dataProcesso = (data: string | null) => data ? data.slice(0, 10).split("-").reverse().join("/") : "—";
export const numeroProcesso = (valor: number | null) => valor == null ? "—" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function idsHistoricoSobDemanda(regras: ProcessoRegra[], expandidas: Set<string>) {
  return regras.filter((r) => r.mudancas > 0 && expandidas.has(r.id)).map((r) => r.id).sort();
}

export function useProcessoRegras(processoId: string) {
  return useQuery({
    queryKey: ["processos", "regras", processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoRegra[]> => {
      const { data, error } = await supabase.from("vw_processo_regra" as never)
        .select("*").eq("processo_id", processoId).order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as ProcessoRegra[];
    },
  });
}

/** Uma leitura em lote para as regras expandidas com mudanças, nunca uma consulta por linha. */
export function useProcessoRegrasHistorico(processoId: string, regraIds: string[]) {
  return useQuery({
    queryKey: ["processos", "regras-historico", processoId, regraIds],
    enabled: regraIds.length > 0,
    queryFn: async (): Promise<Map<string, ProcessoRegraHistorico[]>> => {
      const { data, error } = await supabase.from("processo_regra_historico" as never)
        .select("regra_id,valor,unidade,valor_texto,conta_a_partir_de,definido_por,definido_em,motivo,substituido_em")
        .in("regra_id", regraIds).order("substituido_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const mapa = new Map<string, ProcessoRegraHistorico[]>();
      for (const r of (data ?? []) as unknown as ProcessoRegraHistorico[]) {
        mapa.set(r.regra_id, [...(mapa.get(r.regra_id) ?? []), r]);
      }
      return mapa;
    },
  });
}