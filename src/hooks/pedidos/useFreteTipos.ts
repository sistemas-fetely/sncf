import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FreteTipo {
  codigo: string;
  rotulo: string | null;
  entra_no_liquido: boolean;
  rateia_por: string | null;
}

/**
 * Dimensão de tipos de frete. Quem decide se o frete entra no líquido é a
 * tabela `frete_tipos` — nunca uma string hardcoded no front.
 */
export function useFreteTipos() {
  const q = useQuery({
    queryKey: ["frete-tipos"],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<FreteTipo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("frete_tipos")
        .select("codigo, rotulo, entra_no_liquido, rateia_por")
        .eq("ativo", true);
      if (error) throw error;
      return (data || []) as FreteTipo[];
    },
  });

  const tipos = q.data || [];

  function getFreteTipo(codigo?: string | null): FreteTipo | null {
    if (!codigo) return null;
    return tipos.find((t) => t.codigo === codigo) ?? null;
  }

  function freteEntraNoLiquido(codigo?: string | null): boolean {
    return getFreteTipo(codigo)?.entra_no_liquido === true;
  }

  return { ...q, tipos, getFreteTipo, freteEntraNoLiquido };
}
