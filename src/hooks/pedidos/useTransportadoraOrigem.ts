import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TransportadoraOrigem {
  codigo: string;
  rotulo: string | null;
  congela_sugestao: boolean | null;
  ordem: number | null;
  ativo: boolean | null;
}

/**
 * Dimensão de origem da transportadora no pedido. Quem decide se a sugestão
 * congela é a tabela `pedido_transportadora_origem` — nunca hardcoded no front.
 */
export function useTransportadoraOrigem() {
  const q = useQuery({
    queryKey: ["pedido-transportadora-origem"],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TransportadoraOrigem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_transportadora_origem")
        .select("codigo, rotulo, congela_sugestao, ordem, ativo")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data || []) as TransportadoraOrigem[];
    },
  });

  const origens = q.data || [];

  function getOrigem(codigo?: string | null): TransportadoraOrigem | null {
    if (!codigo) return null;
    return origens.find((o) => o.codigo === codigo) ?? null;
  }

  /** Rótulo vindo da dimensão. Códigos desativados caem no próprio código. */
  function rotuloOrigem(codigo?: string | null): string {
    if (!codigo) return "—";
    return getOrigem(codigo)?.rotulo || codigo;
  }

  return { ...q, origens, getOrigem, rotuloOrigem };
}
