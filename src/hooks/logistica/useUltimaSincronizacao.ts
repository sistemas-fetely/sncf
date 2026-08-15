import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SincronizacaoRow {
  atualizado_em: string | null;
  origem_dado: string | null;
}

export function useUltimaSincronizacao(transportadoraId: string | null) {
  return useQuery({
    queryKey: ["logistica", "ultima-sincronizacao", transportadoraId],
    queryFn: async (): Promise<SincronizacaoRow | null> => {
      if (!transportadoraId) return null;
      const { data, error } = await supabase
        .from("vw_logistica_entrega_custo")
        .select("atualizado_em, origem_dado")
        .eq("transportadora_id", transportadoraId)
        .order("atualizado_em", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SincronizacaoRow | null;
    },
    enabled: !!transportadoraId,
    refetchInterval: 5 * 60 * 1000, // 5 minutos
  });
}
