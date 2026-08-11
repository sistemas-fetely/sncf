import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Extrato da Conta — leitura exclusiva da view `vw_extrato_conta`.
 * Nada é recalculado aqui: a view é a única fonte de verdade.
 */

export type SentidoExtrato = "entrada" | "saida";

export interface ExtratoLinha {
  id: string;
  conta_bancaria_id: string;
  conta_nome: string | null;
  data_transacao: string | null;
  data_hora: string | null;
  descricao: string | null;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  valor: number | null;
  sentido: SentidoExtrato | null;
  valor_abs: number | null;
  tipo_meio: string | null;
  classe: string | null;
  classe_definida_por: string | null;
  origem: string | null;
  referencia_pedido: string | null;
  conciliado: boolean | null;
  plano_contas_id: string | null;
  plano_contas_nome: string | null;
  centro_custo_id: string | null;
  conta_pagar_id: string | null;
  par_transferencia_id: string | null;
  casada_com_id: string | null;
  duplicada_de: string | null;
  categoria_inconsistente: boolean | null;
  fonte_importacao_id: string | null;
  linha_informativa: boolean | null;
  informativa_fonte: string | null;
  descartada: boolean | null;
  conta_no_saldo: boolean | null;
  saldo_corrido: number | null;
  saldo_banco_do_dia: number | null;
}

export interface ExtratoFiltrosServidor {
  /** YYYY-MM-DD — null = sem limite */
  dataInicio: string | null;
  dataFim: string | null;
  busca: string;
  sentido: "todos" | SentidoExtrato;
  conciliado: "todos" | "sim" | "nao";
}

const LIMITE = 5000;

export function useExtratoConta(
  contaId: string | undefined,
  filtros: ExtratoFiltrosServidor,
) {
  return useQuery({
    queryKey: ["extrato-conta", contaId, filtros],
    enabled: !!contaId,
    queryFn: async (): Promise<ExtratoLinha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("vw_extrato_conta")
        .select("*")
        .eq("conta_bancaria_id", contaId)
        // Doutrina: linha informativa NUNCA aparece. Filtro sem toggle.
        .or("linha_informativa.is.null,linha_informativa.eq.false")
        .order("data_transacao", { ascending: false })
        .order("data_hora", { ascending: false })
        .limit(LIMITE);

      if (filtros.dataInicio) q = q.gte("data_transacao", filtros.dataInicio);
      if (filtros.dataFim) q = q.lte("data_transacao", filtros.dataFim);
      if (filtros.sentido !== "todos") q = q.eq("sentido", filtros.sentido);
      if (filtros.conciliado !== "todos")
        q = q.eq("conciliado", filtros.conciliado === "sim");

      const termo = filtros.busca.trim();
      if (termo) {
        const t = termo.replace(/[,%()]/g, " ");
        q = q.or(
          [
            `descricao.ilike.%${t}%`,
            `contraparte_nome.ilike.%${t}%`,
            `contraparte_documento.ilike.%${t}%`,
            `referencia_pedido.ilike.%${t}%`,
          ].join(","),
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ExtratoLinha[];
    },
  });
}

/**
 * Valores realmente presentes na conta (para popular os selects múltiplos).
 * Lê a mesma view, sem filtro de período.
 */
export function useExtratoContaOpcoes(contaId: string | undefined) {
  return useQuery({
    queryKey: ["extrato-conta-opcoes", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_extrato_conta")
        .select("tipo_meio, classe, origem, data_transacao, conta_nome")
        .eq("conta_bancaria_id", contaId)
        .or("linha_informativa.is.null,linha_informativa.eq.false")
        .order("data_transacao", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;

      const rows = (data || []) as Array<{
        tipo_meio: string | null;
        classe: string | null;
        origem: string | null;
        data_transacao: string | null;
        conta_nome: string | null;
      }>;

      const unicos = (campo: "tipo_meio" | "classe" | "origem") =>
        Array.from(
          new Set(rows.map((r) => r[campo]).filter((v): v is string => !!v)),
        ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      return {
        meios: unicos("tipo_meio"),
        classes: unicos("classe"),
        origens: unicos("origem"),
        contaNome: rows.find((r) => r.conta_nome)?.conta_nome ?? null,
        ultimoLancamento: rows[0]?.data_transacao ?? null,
      };
    },
  });
}
