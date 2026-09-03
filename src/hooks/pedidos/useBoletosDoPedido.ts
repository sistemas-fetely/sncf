import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoletoVigente } from "@/components/credito/AvisoBoletosVivos";

/**
 * PERMISSAO-DE-ACAO-NAO-DA-LEITURA (03/09/2026): este hook lia `titulo_a_receber`,
 * `vw_titulo_boleto_vigente` e `titulo_boleto` direto do cliente. As tres sao trancadas
 * por `pode_ler_tabela`, mapeadas so para telas de Financas/Cobranca. Quem tem
 * `tela.comercial` + `acao.mesa_ver_boletos` recebia ZERO linha e a Mesa dizia
 * "Nenhum boleto neste pedido" — mentira silenciosa.
 *
 * Agora tudo vem de `fn_mesa_boletos_pedido`, SECURITY DEFINER, que decide a porta
 * (`acao.mesa_ver_boletos` OU porta de leitura ja no mapa) e ESTOURA quando nao ha
 * permissao, em vez de devolver lista vazia. A linha digitavel so vem para quem tem
 * `acao.mesa_baixar_boleto` — consultar nao e entregar o instrumento ao cliente.
 *
 * Forma publica preservada de proposito: `BoletoTitulo` e o retorno sao identicos ao
 * que PedidoOportunidadeDialog e PedidoDetalhe ja consomem.
 */

export interface BoletoTitulo {
  id: string;
  numero_parcela: number;
  total_parcelas: number;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  status: string | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
  boleto_vigente: BoletoVigente | null;
  boleto_ultimo: { nosso_numero: string | null; situacao: string | null } | null;
}

export function useBoletosDoPedido(pedido_id: string | undefined) {
  return useQuery({
    queryKey: ["boletos-do-pedido", pedido_id],
    enabled: !!pedido_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_mesa_boletos_pedido", {
        p_pedido_id: pedido_id,
      });
      // FAIL-LOUD: erro de permissao ou de banco sobe com o corpo real.
      if (error) throw new Error(`Falha ao carregar os boletos do pedido: ${error.message}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boletoTitulos: BoletoTitulo[] = ((data ?? []) as any[]).map((r) => ({
        id: r.titulo_id,
        numero_parcela: r.numero_parcela,
        total_parcelas: r.total_parcelas,
        data_vencimento_atual: r.data_vencimento_atual ?? null,
        valor_bruto:
          r.valor_bruto === null || r.valor_bruto === undefined ? null : Number(r.valor_bruto),
        status: r.status ?? null,
        boleto_status: r.boleto_status ?? null,
        linha_digitavel: r.linha_digitavel ?? null,
        // A RPC devolve uma linha por titulo mesmo sem boleto vivo (enviavel=false,
        // boletos_vivos=0), igual `vw_titulo_boleto_vigente` fazia. Mantido assim.
        boleto_vigente: {
          titulo_id: r.titulo_id,
          enviavel: r.vig_enviavel === true,
          nosso_numero: r.vig_nosso_numero ?? null,
          linha_digitavel: r.vig_linha_digitavel ?? null,
          data_vencimento: r.vig_data_vencimento ?? null,
          valor: r.vig_valor === null || r.vig_valor === undefined ? null : Number(r.vig_valor),
          situacao: r.vig_situacao ?? null,
          vigente_em_baixa: r.vig_vigente_em_baixa === true,
          boletos_vivos: Number(r.vig_boletos_vivos ?? 0),
          nosso_numero_em_baixa: r.vig_nosso_numero_em_baixa ?? null,
        },
        // NOSSO-NUMERO-NAO-MORRE: boleto liquidado sai do vigente mas segue sendo a
        // chave de conferencia com o banco.
        boleto_ultimo:
          r.ult_nosso_numero || r.ult_situacao
            ? { nosso_numero: r.ult_nosso_numero ?? null, situacao: r.ult_situacao ?? null }
            : null,
      }));

      const qtdTotal = boletoTitulos.length;
      const qtdRegistrados = boletoTitulos.filter((t) => t.boleto_vigente?.enviavel).length;
      return {
        boletoTitulos,
        temBoletos: qtdTotal > 0,
        qtdTotal,
        qtdRegistrados,
        todosRegistrados: qtdTotal > 0 && qtdRegistrados === qtdTotal,
      };
    },
  });
}
