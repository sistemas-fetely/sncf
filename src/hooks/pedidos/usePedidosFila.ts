import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoFilaItem, EstagioPedido, AreaPedido } from "@/types/pedido";

import { useListaPaginada, type ParamsLista, type FiltroLista } from "@/lib/lista/useListaPaginada";

export interface Opts {
  pagina?: number;
  tamanho?: number;
  filtros?: FiltroLista[];
  ordem?: ParamsLista["ordem"];
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
  const termo = (opts.busca ?? "").trim();
  const apelidos = useQuery({
    queryKey: ["fila-parceiros-busca", termo], enabled: termo.length >= 2 && !opts.comPagamentoSemVinculo,
    queryFn: async () => {
      const ids: string[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("vw_parceiro_nome").select("parceiro_id")
          .ilike("apelido", `%${termo.replace(/[,()%]/g, " ").trim()}%`).order("parceiro_id").range(inicio, inicio + 499);
        if (error) throw error;
        ids.push(...(data ?? []).map(r => r.parceiro_id).filter((id): id is string => !!id));
        if ((data?.length ?? 0) < 500) return ids;
      }
    },
  });
  const candidatos = useQuery({
    queryKey: ["fila-candidatos-ids"], enabled: !!opts.comPagamentoSemVinculo,
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_portao_candidato").select("pedido_id");
      if (error) throw error;
      return [...new Set((data ?? []).map(r => r.pedido_id))];
    },
  });
  const filtros: FiltroLista[] = [];
  if (!opts.comPagamentoSemVinculo && opts.area && opts.area !== "todas") filtros.push({ c: "area_atual", op: "eq", v: opts.area });
  if (opts.parceiroId) filtros.push({ c: "parceiro_id", op: "eq", v: opts.parceiroId });
  const explicito = !!opts.estagios?.length || (!!opts.estagio && opts.estagio !== "todos");
  if (!opts.comPagamentoSemVinculo && opts.estagios?.length) filtros.push({ c: "estagio", op: "in", v: opts.estagios });
  else if (!opts.comPagamentoSemVinculo && opts.estagio && opts.estagio !== "todos") filtros.push({ c: "estagio", op: "eq", v: opts.estagio });
  if (opts.apenasAtivos && !(termo && !explicito) && !opts.comPagamentoSemVinculo && !opts.somenteTravados)
    filtros.push({ c: "estagio", op: "nin", v: opts.incluirCancelados ? ["entregue", "recuperacao_venda"] : ["entregue", "cancelado", "recuperacao_venda"] });
  if (!opts.parceiroId && !opts.comPagamentoSemVinculo && !opts.estagios?.includes("recuperacao_venda")) filtros.push({ c: "estagio", op: "nin", v: ["recuperacao_venda"] });
  if (opts.somenteTravados) filtros.push({ c: "travado", op: "is_true" });
  if (opts.comPagamentoSemVinculo) filtros.push({ c: "id", op: "in", v: candidatos.data?.length ? candidatos.data : ["00000000-0000-0000-0000-000000000000"] });
  if (termo) {
    const t = termo.replace(/[,()%]/g, " ").trim();
    const digitos = t.replace(/\D/g, "");
    const alternativas: FiltroLista[] = ["parceiro_razao", "parceiro_cnpj", "id_externo"].map(c => ({ c, op: "ilike", v: t }));
    if (digitos.length >= 3 && digitos !== t) alternativas.push({ c: "parceiro_cnpj", op: "ilike", v: digitos });
    if (apelidos.data?.length) alternativas.push({ c: "parceiro_id", op: "in", v: apelidos.data });
    filtros.push({ op: "or", v: alternativas });
  }
  filtros.push(...(opts.filtros ?? []));
  const lista = useListaPaginada<PedidoFilaItem>({
    relacao: "vw_pedidos_fila_lista", filtros, pagina: opts.pagina ?? 1, tamanho: opts.tamanho ?? 20,
    ordem: opts.ordem ?? [{ c: "recebido_em", dir: "desc" }],
    facetas: ["area_atual", "estagio", "travado", "marcacao", "forma_solicitada", "cd_expedicao_codigo", "cd_expedicao_nome"],
    agregados: [{ id: "estagios", fn: "count", por: ["estagio"] },
      { id: "cds", fn: "count", por: ["cd_expedicao_codigo", "cd_expedicao_nome"], ignorar: ["cd_expedicao_codigo"] }],
  }, { enabled: !(termo.length >= 2 && !opts.comPagamentoSemVinculo && apelidos.isPending) && !(opts.comPagamentoSemVinculo && candidatos.isPending), debounceMs: 0 });
  // Dados vivos complementares apenas para os pedidos da página.
  const ids = lista.data?.linhas.map(p => p.id) ?? [];
  const detalhes = useQuery({
    queryKey: ["pedidos-fila", "financeiro-pagina", ids], enabled: ids.length > 0,
    queryFn: async () => {
      const [sf, adv] = await Promise.all([
        supabase.from("vw_pedido_situacao_financeira").select("*").in("pedido_id", ids),
        supabase.from("vw_pedido_adiantamento").select("*").in("pedido_id", ids),
      ]);
      if (sf.error) throw sf.error; if (adv.error) throw adv.error;
      return { sf: new Map((sf.data ?? []).map(r => [r.pedido_id, r])), adv: new Map((adv.data ?? []).map(r => [r.pedido_id, r])) };
    },
  });
  return { ...lista, error: lista.error ?? apelidos.error ?? candidatos.error ?? detalhes.error,
    isError: lista.isError || apelidos.isError || candidatos.isError || detalhes.isError,
    data: lista.data ? { ...lista.data, linhas: lista.data.linhas.map(p => {
      const a = detalhes.data?.adv.get(p.id);
      return { ...p, ...detalhes.data?.sf.get(p.id), ...(a ? { adiantado_vivo: a.adiantado_vivo,
        adiantado_lancamentos: a.lancamentos, adiantado_formas: a.formas, adiantado_recebido_em: a.recebido_em,
        adiantado_pct_pago: a.pct_pago, adiantado_cobre_pedido_inteiro: a.cobre_pedido_inteiro } : {}) } as PedidoFilaItem;
    }) } : undefined };
}
