/**
 * ÓRFÃOS DE ENTRADA — camada de dados.
 *
 * Crédito bancário sem dono identificado. O operador diz de quem é, o banco
 * aprende o pagador e o ciclo segue sozinho (crédito → conta do cliente → FIFO).
 *
 * View e RPC ainda não estão nos types gerados: chamadas via `(supabase as any)`,
 * mesmo padrão de useContaCliente.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@tanstack/../integrations/supabase/client";

export const QK_ORFAOS = "conciliacao-orfaos";

export type SugestaoForca = "doc_e_cnpj_do_cliente" | "pagador_ja_ensinado" | null;

export interface OrfaoEntrada {
  movimentacao_id: string;
  data_transacao: string;
  valor: number;
  meio: string | null;
  descricao: string | null;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  conta: string | null;
  dias_em_aberto: number | null;
  pos_corte: boolean | null;
  parceiro_sugerido_id: string | null;
  parceiro_sugerido_nome: string | null;
  sugestao_forca: SugestaoForca;
}

/** Fila de órfãos, mais recente primeiro. */
export function useConciliacaoOrfaos() {
  return useQuery({
    queryKey: [QK_ORFAOS],
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: async (): Promise<OrfaoEntrada[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_orfaos")
        .select("*")
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrfaoEntrada[];
    },
  });
}

export interface AtribuirOrfaoInput {
  movimentacao_id: string;
  parceiro_id: string;
  nota?: string | null;
}

export interface AtribuirOrfaoResultado {
  ok: boolean;
  erro?: string | null;
  lancamento_id?: string;
  valor?: number;
  pagador_aprendido?: boolean;
}

/**
 * Atribui o crédito a um cliente. FAIL-LOUD: erro do banco sobe e `ok: false`
 * também vira exceção, para quem chama mostrar a mensagem do banco.
 */
export function useAtribuirOrfao() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AtribuirOrfaoInput): Promise<AtribuirOrfaoResultado> => {
      const { data: sessao } = await supabase.auth.getUser();

      const { data, error } = await (supabase as any).rpc("fn_extrato_atribuir_cliente", {
        p_movimentacao_id: input.movimentacao_id,
        p_parceiro_id: input.parceiro_id,
        p_nota: input.nota ?? null,
        p_user_id: sessao?.user?.id ?? null,
      });
      if (error) throw error;

      const res = (data ?? {}) as AtribuirOrfaoResultado;
      if (!res.ok) throw new Error(res.erro || "O banco recusou a atribuição desta entrada.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK_ORFAOS] });
      qc.invalidateQueries({ queryKey: ["conta-cliente-saldo"] });
      qc.invalidateQueries({ queryKey: ["entradas-reconhecer"] });
    },
  });
}
