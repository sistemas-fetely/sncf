import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * COBERTURA DE LASTRO NOS PEDIDOS — critério vigente (17/08/2026).
 *
 * O antigo critério pintava "Sem Estoque" por SKU lendo `vw_estoque.estoque_virtual`,
 * um número AGREGADO (estoque − reservas de TODOS os pedidos). Isso contava a reserva
 * do próprio pedido contra ele mesmo e marcava de vermelho pedidos que tinham lastro.
 *
 * Agora a cobertura é POR ITEM DE PEDIDO, calculada no banco por fila FIFO (data do
 * pedido) contra o estoque real do SKU: cada item recebe `qtd_coberta` / `qtd_descoberta`
 * conforme sua `posicao_fila`. O pedido não se exclui mais a si mesmo.
 *
 * Fontes (views já existentes, somente leitura):
 *  - `vw_pedido_item_cobertura` — grão item de pedido
 *  - `vw_pedido_cobertura`     — grão pedido
 *
 * Atenção: `vw_estoque.estoque_virtual` continua correto para telas de catálogo/estoque
 * (Produtos, DestinosCadastro), onde o agregado é justamente o que se quer ver.
 */

export type Cobertura = "coberto" | "parcial" | "descoberto" | "sem_lastro" | "faturado" | "separado";

export interface CoberturaItem {
  id: string;
  cobertura: Cobertura;
  qtd_coberta: number;
  qtd_descoberta: number;
  quantidade: number;
  sku: string | null;
}

export interface CoberturaPedido {
  pedido_id: string;
  id_externo: string | null;
  na_fila: boolean;
  itens_total: number;
  itens_cobertos: number;
  itens_parciais: number;
  itens_descobertos: number;
  itens_separados: number;
  un_descobertas: number;
  un_total: number;
  un_cobertas: number;
  pct_coberto: number;
  cobertura_pedido: "coberto" | "parcial" | "descoberto" | "faturado" | "separado";
}


function idsUnicos(pedidoIds: (string | null | undefined)[]): string[] {
  return Array.from(new Set(pedidoIds.filter((i): i is string => !!i)));
}

/** Cobertura por item dos pedidos informados. Chave do mapa: item_id. */
export async function buscarCoberturaItens(
  pedidoIds: string[],
): Promise<Map<string, CoberturaItem>> {
  const ids = idsUnicos(pedidoIds);
  const mapa = new Map<string, CoberturaItem>();
  if (ids.length === 0) return mapa;

  const { data, error } = await (supabase as any)
    .from("vw_pedido_item_cobertura")
    .select("item_id, sku, quantidade, qtd_coberta, qtd_descoberta, cobertura")
    .in("pedido_id", ids);

  if (error) throw new Error(`[cobertura] falha ao ler vw_pedido_item_cobertura: ${error.message}`);

  for (const row of data ?? []) {
    mapa.set(row.item_id, {
      id: row.item_id,
      cobertura: row.cobertura as Cobertura,
      qtd_coberta: Number(row.qtd_coberta ?? 0),
      qtd_descoberta: Number(row.qtd_descoberta ?? 0),
      quantidade: Number(row.quantidade ?? 0),
      sku: row.sku ?? null,
    });
  }
  return mapa;
}

/** Hook: cobertura por item, em lote, para os pedidos informados. */
export function useCoberturaItens(pedidoIds: (string | null | undefined)[]) {
  const ids = idsUnicos(pedidoIds);
  const chave = ids.slice().sort().join("|");
  return useQuery({
    queryKey: ["cobertura-itens", chave],
    queryFn: () => buscarCoberturaItens(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
  });
}

/** Cobertura consolidada por pedido. Chave do mapa: pedido_id. */
export async function buscarCoberturaPedidos(
  pedidoIds: string[],
): Promise<Map<string, CoberturaPedido>> {
  const ids = idsUnicos(pedidoIds);
  const mapa = new Map<string, CoberturaPedido>();
  if (ids.length === 0) return mapa;

  const { data, error } = await (supabase as any)
    .from("vw_pedido_cobertura")
    .select(
      "pedido_id, id_externo, na_fila, itens_total, itens_cobertos, itens_parciais, itens_descobertos, itens_separados, un_descobertas, un_total, un_cobertas, pct_coberto, cobertura_pedido",
    )

    .in("pedido_id", ids);

  if (error) throw new Error(`[cobertura] falha ao ler vw_pedido_cobertura: ${error.message}`);

  for (const row of data ?? []) {
    mapa.set(row.pedido_id, {
      pedido_id: row.pedido_id,
      id_externo: row.id_externo ?? null,
      na_fila: !!row.na_fila,
      itens_total: Number(row.itens_total ?? 0),
      itens_cobertos: Number(row.itens_cobertos ?? 0),
      itens_parciais: Number(row.itens_parciais ?? 0),
      itens_descobertos: Number(row.itens_descobertos ?? 0),
      itens_separados: Number(row.itens_separados ?? 0),
      un_descobertas: Number(row.un_descobertas ?? 0),
      un_total: Number(row.un_total ?? 0),
      un_cobertas: Number(row.un_cobertas ?? 0),
      pct_coberto: Number(row.pct_coberto ?? 0),
      cobertura_pedido: row.cobertura_pedido,
    });
  }

  return mapa;
}

/** Hook: cobertura por pedido, em lote. */
export function useCoberturaPedidos(pedidoIds: (string | null | undefined)[]) {
  const ids = idsUnicos(pedidoIds);
  const chave = ids.slice().sort().join("|");
  return useQuery({
    queryKey: ["cobertura-pedidos", chave],
    queryFn: () => buscarCoberturaPedidos(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
  });
}

/**
 * Rótulo humano da cobertura de um item. `null` = nada a mostrar (item com lastro
 * ou já faturado — faturado saiu da fila de reserva).
 */
export function rotuloCobertura(
  cobertura: Cobertura | null | undefined,
  qtdCoberta: number,
  quantidade: number,
): string | null {
  if (!cobertura) return null;
  if (cobertura === "coberto" || cobertura === "faturado" || cobertura === "separado") return null;
  if (cobertura === "parcial") return `Parcial · ${qtdCoberta} de ${quantidade}`;
  return "Sem lastro";
}

/**
 * DIMENSAO-VIA-TABELA (04/09/2026): a pergunta que a coluna Estoque faz muda por fase.
 * Antes da separacao a fonte e a fila; depois dela, a prova fisica da XPM. Nenhuma tela
 * decide isso por lista de estagios hardcoded — quem decide e `politica_cobertura_estagio`.
 */
export type FonteCobertura = "lastro_livre" | "fila" | "prova_separacao" | "foto_xpm" | "nenhuma";

export interface PoliticaCobertura {
  estagio: string;
  fonte: FonteCobertura;
  rotulo: string | null;
  mostra_na_fila: boolean;
  mostra_no_pedido: boolean;
  alerta_divergencia: boolean;
}

/** Politica de cobertura por estagio. Chave do mapa: estagio. */
export function usePoliticaCobertura() {
  return useQuery({
    queryKey: ["politica-cobertura-estagio"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("politica_cobertura_estagio")
        .select("estagio, fonte, rotulo, mostra_na_fila, mostra_no_pedido, alerta_divergencia");
      if (error)
        throw new Error(`[cobertura] falha ao ler politica_cobertura_estagio: ${error.message}`);
      const mapa = new Map<string, PoliticaCobertura>();
      for (const row of data ?? []) {
        mapa.set(row.estagio, {
          estagio: row.estagio,
          fonte: row.fonte,
          rotulo: row.rotulo ?? null,
          mostra_na_fila: !!row.mostra_na_fila,
          mostra_no_pedido: !!row.mostra_no_pedido,
          alerta_divergencia: !!row.alerta_divergencia,
        });
      }
      return mapa;
    },
    staleTime: 10 * 60 * 1000,
  });
}



