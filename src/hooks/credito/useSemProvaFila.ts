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
 *
 * COBRANCA-SEPARA-CLIENTE-DE-DEFEITO (02/09/2026): a tela deixa de ser só
 * "sem prova" e passa a ser "Problemas Cobrança" — tudo que impede receber e
 * NÃO é dívida do cliente. A Régua fica com o que se cobra de gente
 * (EM_CURSO, A_VENCER, A_COBRAR); aqui mora o defeito do nosso lado.
 *
 * `A_REEMITIR_BOLETO` estava com `regua_elegivel = true`, ou seja na fila ATIVA
 * de cobrança: a operação cobrava o cliente de um boleto que não funciona.
 * `CONCILIAR` cartão aparecia nas DUAS telas ao mesmo tempo.
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

/**
 * Defeito de instrumento: o título é legítimo e o cliente pode até estar em dia,
 * mas o meio de cobrança está quebrado. Não se cobra pessoa por isso — conserta-se.
 */
export function useInstrumentoQuebradoFila() {
  return useQuery({
    queryKey: ["cobranca-mesa", "instrumento-quebrado"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LinhaMesa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .in("fila", ["A_REEMITIR_BOLETO", "A_EMITIR_BOLETO", "EMAIL_BLOQUEADO", "A_ENVIAR"])
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as LinhaMesa[];
    },
  });
}

/**
 * NAO_COBRAVEL — regime próprio (consignado, haver, permuta), não é problema.
 * Bloco INFORMATIVO: existia sem nenhuma tela mostrando. Invisível não é o mesmo
 * que resolvido.
 */
export function useNaoCobravelFila() {
  return useQuery({
    queryKey: ["cobranca-mesa", "nao-cobravel"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LinhaMesa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .eq("fila", "NAO_COBRAVEL")
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
