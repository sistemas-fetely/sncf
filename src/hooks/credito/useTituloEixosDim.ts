import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EixoDim {
  codigo: string;
  rotulo: string;
  cor: string | null;
  descricao: string | null;
}

/**
 * Dimensão dos dois eixos de título (prova e status).
 * Praticamente imutável — staleTime de 1 hora.
 * Rótulo, cor e descrição vêm do banco; nada de texto hardcoded na tela.
 */
export function useTituloEixosDim() {
  return useQuery({
    queryKey: ["titulo-eixos-dim"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<{ prova: Record<string, EixoDim>; status: Record<string, EixoDim> }> => {
      const [prova, status] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("titulo_eixo_prova").select("codigo, rotulo, cor, descricao"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("titulo_eixo_status").select("codigo, rotulo, cor, descricao"),
      ]);
      if (prova.error) throw prova.error;
      if (status.error) throw status.error;

      const indexar = (linhas: EixoDim[] | null) =>
        Object.fromEntries((linhas ?? []).map((l) => [l.codigo, l])) as Record<string, EixoDim>;

      return {
        prova: indexar(prova.data as EixoDim[] | null),
        status: indexar(status.data as EixoDim[] | null),
      };
    },
  });
}
