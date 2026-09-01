import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";

/**
 * CARTÃO-NÃO-VENCE-PROVA-VENCE.
 *
 * Fonte única: `vw_cobranca_mesa`. A classificação, a gravidade e a frase de
 * orientação já vêm prontas do banco — a tela não reimplementa nada.
 *
 * Duas leituras:
 *  - `PAGO_SEM_PROVA`: título com dinheiro declarado e prova faltando.
 *  - cartão em `CONCILIAR`: não é atraso do cliente, é liquidação da adquirente
 *    ainda não conciliada. Sai da Régua (Peça 2) e passa a viver aqui.
 */
export function useSemProvaFila() {
  return useQuery({
    queryKey: ["cobranca-mesa", "sem-prova"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LinhaMesa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .eq("fila", "PAGO_SEM_PROVA")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as LinhaMesa[];
    },
  });
}

/** Cartão em conciliação — o que a Régua deixou de exibir. */
export function useCartaoConciliarFila() {
  return useQuery({
    queryKey: ["cobranca-mesa", "cartao-conciliar"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LinhaMesa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .eq("fila", "CONCILIAR")
        .eq("instrumento", "cartao")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as LinhaMesa[];
    },
  });
}
