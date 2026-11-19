import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarTodos } from "@/lib/supabaseLotes";

/**
 * Leitura da view vw_ciclo_titulo (grão título) por mês do pedido.
 * Opções (mês/tipo/elo) vêm das facetas do fn_lista; os dados, só do mês escolhido.
 * "todos" carrega em lotes (buscarTodos) para não cortar em 1.000 linhas.
 * Somente leitura — nenhuma mutation.
 */
export interface CicloTituloRow {
  titulo_id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  data_pedido: string | null;
  mes_pedido: string | null;
  estagio: string | null;
  cliente: string | null;
  nf_id: string | null;
  nf_ref: string | null;
  nf_data: string | null;
  mes_competencia: string | null;
  tipo_pagamento: string | null;
  forma_nome: string | null;
  gera_caixa: boolean | null;
  banco_recebimento: string | null;
  status: string | null;
  valor_bruto: number | null;
  valor_atual: number | null;
  data_vencimento_atual: string | null;
  data_pagamento: string | null;
  data_liquidacao_prevista: string | null;
  ancora_regua: string | null;
  movimentacao_id: string | null;
  mov_data: string | null;
  mov_valor: number | null;
  mes_caixa: string | null;
  mov_classe: string | null;
  mov_conciliado: boolean | null;
  mov_conta: string | null;
  mov_descricao: string | null;
  quitado_por_haver: boolean | null;
  haver_cliente_total: number | null;
  haver_cliente_saldo: number | null;

  elo_caixa: string | null;
}

type Faceta = { valor: string | null; contagem: number };

/** Valores distintos de mês, tipo e elo (facetas do fn_lista). Meses em ordem decrescente. */
export function useFluxoCompetenciaOpcoes() {
  return useQuery({
    queryKey: ["fluxo-competencia", "opcoes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_lista" as never, {
        p: { relacao: "vw_ciclo_titulo", tamanho: 1, facetas: ["mes_pedido", "tipo_pagamento", "elo_caixa"] },
      } as never);
      if (error) throw error;
      const f = ((data as unknown as { facetas?: Record<string, Faceta[]> } | null)?.facetas ?? {});
      const valores = (c: string) => (f[c] ?? []).map((x) => x.valor).filter(Boolean) as string[];
      return {
        meses: valores("mes_pedido").sort((a, b) => b.localeCompare(a)),
        tipos: valores("tipo_pagamento").sort(),
        elos: valores("elo_caixa").sort(),
      };
    },
  });
}

/** Linhas do mês (ou de todos os meses, em lotes). `mes` vazio = ainda sem default, não busca. */
export function useFluxoCompetencia(mes: string) {
  return useQuery({
    queryKey: ["fluxo-competencia", "vw_ciclo_titulo", mes],
    enabled: mes !== "",
    queryFn: async () => {
      if (mes === "todos") {
        return (await buscarTodos(() => (supabase as any).from("vw_ciclo_titulo").select("*"), ["titulo_id"])) as CicloTituloRow[];
      }
      const { data, error } = await (supabase as any)
        .from("vw_ciclo_titulo")
        .select("*")
        .eq("mes_pedido", mes);
      if (error) throw error;
      return (data ?? []) as CicloTituloRow[];
    },
  });
}
