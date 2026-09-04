import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Pedido que já tem a peça reservada — só existe em veredito `fila_disputada`. */
export interface ConcorrenteEstoque {
  pedido_id: string;
  id_externo: string | null;
  estagio: string | null;
  qtd: number | null;
  recebido_em: string | null;
}

export type VereditoEstoque =
  | "ambos_cobrem"
  | "fila_disputada"
  | "foto_nao_cobre"
  | "falta_real";

export interface ItemPreviaEstoqueXpm {
  sku: string;
  nome: string;
  pedida: number;
  /** = xpm_liberado. Mantido para consumidores antigos. */
  disponivel: number;
  falta: number;
  foto_em: string | null;
  compra_pedidos: string | null;
  compra_a_faturar: number | null;
  compra_em_transito: number | null;
  /** VEREDITO-CRUZADO (04/09/2026): duas leituras, uma decisão. */
  veredito_item: VereditoEstoque | null;
  veredito_item_rotulo?: string | null;
  nosso_disponivel: number | null;
  fiscal_vendavel: number | null;
  reservado_outros: number | null;
  xpm_liberado: number | null;
  xpm_outras_situacoes: number | null;
  concorrentes: ConcorrenteEstoque[];
}

export interface PreviaEstoqueXpm {
  foto_em: string | null;
  itens: ItemPreviaEstoqueXpm[];
  veredito: VereditoEstoque | null;
  veredito_rotulo: string | null;
  barra: boolean;
  /** Permissão exigida para furar ESTE veredito (DIMENSAO-VIA-TABELA). */
  permissao_slug: string | null;
  nivel_ref: number | null;
  /** Código de `xpm_override_dim` a mandar em `forcar`. Null = sem override. */
  override_codigo: string | null;
}

/**
 * Prévia (somente leitura) do veredito cruzado de estoque.
 * `itens` vem VAZIO quando as duas leituras cobrem o pedido.
 */
export function usePreviaEstoqueXpm(pedido_id: string, enabled = true) {
  return useQuery<PreviaEstoqueXpm>({
    queryKey: ["previa-estoque-xpm", pedido_id],
    enabled: !!pedido_id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_xpm_previa_estoque", {
        p_pedido_id: pedido_id,
      });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itens: any[] = Array.isArray(data?.itens) ? data.itens : [];
      return {
        foto_em: data?.foto_em ?? null,
        veredito: data?.veredito ?? null,
        veredito_rotulo: data?.veredito_rotulo ?? null,
        barra: data?.barra === true,
        permissao_slug: data?.permissao_slug ?? null,
        nivel_ref: data?.nivel_ref ?? null,
        override_codigo: data?.override_codigo ?? null,
        itens: itens.map((it) => ({
          ...it,
          concorrentes: Array.isArray(it?.concorrentes) ? it.concorrentes : [],
        })) as ItemPreviaEstoqueXpm[],
      };
    },
  });
}
