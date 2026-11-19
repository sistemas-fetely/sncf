import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoFilaItem, EstagioPedido, AreaPedido } from "@/types/pedido";
import { pedidosComCandidato } from "@/lib/pedidos/portao-candidato";
import { exportarLista, type ParamsLista, type FiltroLista } from "@/lib/lista/useListaPaginada";

interface Opts {
  comPagamentoSemVinculo?: boolean;
  area?: AreaPedido | "todas";
  /** Filtro de UM estágio específico OU 'todos' */
  estagio?: EstagioPedido | "todos";
  /** Filtro de MÚLTIPLOS estágios (tem prioridade sobre `estagio`) */
  estagios?: EstagioPedido[];
  /**
   * Termo de busca (razão social, CNPJ ou id externo). Aplicado no servidor.
   * Sem recorte explícito de estágio, a busca varre todo o histórico —
   * inclusive entregue/cancelado/recuperacao_venda.
   */
  busca?: string;
  /** Restringe a um cliente específico (histórico do parceiro). */
  parceiroId?: string;
  apenasAtivos?: boolean;
  /** Quando true, cancelados entram na consulta. Recuperação (desvio) nunca entra. */
  incluirCancelados?: boolean;
  /** CARD-TRAVADO: só pedidos com o desvio `travado` ativo (v_pedidos_fila.travado). */
  somenteTravados?: boolean;
}


export function usePedidosFila(opts: Opts = {}) {
  return useQuery({
    queryKey: ["pedidos-fila", opts],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoFilaItem[]> => {
      const filtros: FiltroLista[] = [];
      if (!opts.comPagamentoSemVinculo && opts.area && opts.area !== "todas") filtros.push({ c: "area_atual", op: "eq", v: opts.area });
      if (opts.parceiroId) filtros.push({ c: "parceiro_id", op: "eq", v: opts.parceiroId });
      const termo = (opts.busca ?? "").trim();
      const explicito = !!opts.estagios?.length || (!!opts.estagio && opts.estagio !== "todos");
      if (!opts.comPagamentoSemVinculo && opts.estagios?.length) filtros.push({ c: "estagio", op: "in", v: opts.estagios });
      else if (!opts.comPagamentoSemVinculo && opts.estagio && opts.estagio !== "todos") filtros.push({ c: "estagio", op: "eq", v: opts.estagio });
      if (opts.apenasAtivos && !(termo && !explicito) && !opts.comPagamentoSemVinculo && !opts.somenteTravados) {
        filtros.push({ c: "estagio", op: "nin", v: opts.incluirCancelados ? ["entregue", "recuperacao_venda"] : ["entregue", "cancelado", "recuperacao_venda"] });
      }
      if (opts.somenteTravados) filtros.push({ c: "travado", op: "is_true" });
      if (termo) {
        const t = termo.replace(/[,()%]/g, " ").trim();
        const digitos = t.replace(/\D/g, "");
        const clausulas: FiltroLista[] = ["parceiro_razao", "parceiro_cnpj", "id_externo"].map((c) => ({ c, op: "ilike", v: `%${t}%` }));
        if (digitos.length >= 3 && digitos !== t) clausulas.push({ c: "parceiro_cnpj", op: "ilike", v: `%${digitos}%` });
        filtros.push({ op: "or", v: clausulas });
      }
      const params: ParamsLista = { relacao: "v_pedidos_fila", filtros, ordem: [{ c: "recebido_em", dir: "desc" }, { c: "id", dir: "asc" }] };
      // PARE: os consumidores ainda ordenam/filtram por mapas externos não disponíveis
      // na relação. Preservar o universo integral via RPC até esses campos existirem.
      let result: PedidoFilaItem[];
      if (opts.comPagamentoSemVinculo) {
        result = await pedidosComCandidato<PedidoFilaItem>(async () => {
          const { data, error } = await supabase.from("vw_portao_candidato").select("pedido_id");
          if (error) throw error;
          return data ?? [];
        }, (ids) => exportarLista<PedidoFilaItem>({ ...params, ids }));
      } else {
        result = await exportarLista<PedidoFilaItem>(params);
      }


      // Merge de situação financeira (fonte única: vw_pedido_situacao_financeira,
      // derivada apenas de titulo_a_receber). Substitui a leitura de portão como
      // estado financeiro na UI. O portão continua sendo apenas gate de liberação.
      if (result.length > 0) {
        const ids = result.map((p) => p.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sfRows, error: sfErr } = await (supabase as any)
          .from("vw_pedido_situacao_financeira")
          .select(
            "pedido_id, situacao_financeira, situacao_rotulo, lastro_fonte, lastro_porque, valor_pago, valor_aberto, valor_vencido, dias_atraso_max, delta_pedido_titulo, recebivel_na_familia, familia_mae_externo",
          )
          .in("pedido_id", ids);
        if (sfErr) throw sfErr;
        const sfMap = new Map<string, Record<string, unknown>>();
        (sfRows || []).forEach((r: { pedido_id: string } & Record<string, unknown>) => {
          sfMap.set(r.pedido_id, r);
        });
        result = result.map((p) => {
          const sf = sfMap.get(p.id);
          if (!sf) return p;
          return {
            ...p,
            situacao_financeira: sf.situacao_financeira as PedidoFilaItem["situacao_financeira"],
            situacao_rotulo: sf.situacao_rotulo as string | null,
            lastro_fonte: sf.lastro_fonte as string | null,
            lastro_porque: sf.lastro_porque as string | null,
            valor_pago: sf.valor_pago as number | null,
            valor_aberto: sf.valor_aberto as number | null,
            valor_vencido: sf.valor_vencido as number | null,
            dias_atraso_max: sf.dias_atraso_max as number | null,
            delta_pedido_titulo: sf.delta_pedido_titulo as number | null,
            recebivel_na_familia: sf.recebivel_na_familia as boolean | null,
            familia_mae_externo: sf.familia_mae_externo as string | null,
          };
        });
      }

      // ENTRADA-PAGA: dinheiro que já entrou e ainda não virou título
      // (vw_pedido_adiantamento). Convive com a situação financeira: uma coisa é
      // o que ainda vai ser cobrado, outra é o que já foi pago.
      if (result.length > 0) {
        const ids = result.map((p) => p.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: advRows, error: advErr } = await (supabase as any)
          .from("vw_pedido_adiantamento")
          .select(
            "pedido_id, adiantado_vivo, lancamentos, formas, recebido_em, pct_pago, cobre_pedido_inteiro",
          )
          .in("pedido_id", ids);
        if (advErr) throw advErr;
        const advMap = new Map<string, Record<string, unknown>>();
        (advRows || []).forEach((r: { pedido_id: string } & Record<string, unknown>) => {
          advMap.set(r.pedido_id, r);
        });
        result = result.map((p) => {
          const a = advMap.get(p.id);
          if (!a) return p;
          return {
            ...p,
            adiantado_vivo: a.adiantado_vivo as number | null,
            adiantado_lancamentos: a.lancamentos as number | null,
            adiantado_formas: a.formas as string | null,
            adiantado_recebido_em: a.recebido_em as string | null,
            adiantado_pct_pago: a.pct_pago as number | null,
            adiantado_cobre_pedido_inteiro: a.cobre_pedido_inteiro as boolean | null,
          };
        });
      }

      return result;
    },
  });
}
