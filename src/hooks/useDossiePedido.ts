/**
 * Dossiê e hipótese de um pedido — SOB DEMANDA.
 *
 * `vw_dossie_pedido` e `vw_pedido_hipotese` são views CARAS (sete agregações
 * por pedido / fila SafraPay). Varredura completa dá timeout. Portanto:
 * só buscar por `pedido_id`, só quando o bloco estiver expandido (`enabled`),
 * com staleTime alto pra não refetch a cada abrir/fechar.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STALE = 10 * 60 * 1000;

export type Hipotese = {
  pedido_id: string;
  pedido_ref: string | null;
  estagio: string | null;
  cliente: string | null;
  regra_codigo: string | null;
  regra_rotulo: string | null;
  meio: string | null;
  grao: string | null;
  confianca: string | null;
  confianca_rotulo: string | null;
  confianca_cor: string | null;
  confianca_ordem: number | null;
  acao: string | null;
  rota: string | null;
  tela: string | null;
  permite_lote: boolean | null;
  regra_ordem: number | null;
  valor_em_jogo: number | null;
  evidencia: Record<string, unknown> | null;
  evidencia_texto: string | null;
};

export type DossieFamiliaFilho = {
  pedido_id: string | null;
  ref: string | null;
  estagio: string | null;
  ativo: boolean | null;
  valor: number | null;
  qtd_itens: number | null;
  nfs_venda: number | null;
  vinculo: string | null;
};

export type DossieFamilia = {
  eh_filho: boolean | null;
  eh_derivado: boolean | null;
  qtd_filhos: number | null;
  qtd_filhos_ativos: number | null;
  vinculo_pai: string | null;
  pai: {
    pedido_id?: string | null;
    ref?: string | null;
    estagio?: string | null;
    valor?: number | null;
    nfs_venda?: number | null;
  } | null;
  filhos: DossieFamiliaFilho[] | null;
} | null;

export type DossieItens = {
  cobertura: string | null;
  qtd_pedido: number | null;
  qtd_nf_venda: number | null;
  diferenca_total: number | null;
  skus_divergentes: number | null;
  skus_no_pedido: number | null;
  total_fecha: boolean | null;
  divergencias:
    | {
        sku?: string | null;
        descricao?: string | null;
        qtd_pedido?: number | null;
        qtd_nf?: number | null;
        diferenca?: number | null;
        natureza?: string | null;
      }[]
    | null;
} | null;

export type DossieFiscal = {
  tem_nf_venda: boolean | null;
  tem_nf_nao_venda: boolean | null;
  notas:
    | {
        nf_id?: string | null;
        numero?: string | null;
        situacao?: string | null;
        data_emissao?: string | null;
        valor?: number | null;
        eh_venda?: boolean | null;
        cfops?: string | null;
      }[]
    | null;
} | null;

export type DossieTitulos = {
  qtd: number | null;
  qtd_inadimplente: number | null;
  valor_bruto: number | null;
  eixos: string[] | null;
  lista:
    | {
        titulo_id?: string | null;
        numero?: string | null;
        parcela?: string | null;
        forma?: string | null;
        banco?: string | null;
        eixo_prova?: string | null;
        eixo_status?: string | null;
        valor_bruto?: number | null;
        valor_efetivo?: number | null;
        vencimento?: string | null;
        data_pagamento?: string | null;
        inadimplente?: boolean | null;
        compensado_por?: string | null;
      }[]
    | null;
} | null;

export type DossieCaixa = {
  movimentacoes: Record<string, unknown>[] | null;
  haver_gerado: Record<string, unknown>[] | Record<string, unknown> | null;
  haver_aplicado: Record<string, unknown>[] | Record<string, unknown> | null;
  pago_com_movimentacao?: number | null;
  pago_sem_rastro?: number | null;
  pago_via_haver?: number | null;
  aguarda_safrapay?: number | null;
} | null;

export type DossieTerminais = {
  titulos_terminais: Record<string, unknown>[] | null;
  pedido_cancelado_em: string | null;
  pedido_cancelado_motivo: string | null;
  furo_cancelado_pos_nf: boolean | null;
} | null;

export type Dossie = {
  pedido_id: string;
  pedido_ref: string | null;
  estagio: string | null;
  cliente: string | null;
  cliente_cnpj: string | null;
  data_pedido: string | null;
  valor_pedido: number | null;
  faturado_em: string | null;
  entregue_em: string | null;
  nfs: number | null;
  nf_refs: string | null;
  nf_valor: number | null;
  furos_qtd: number | null;
  achados: Record<string, unknown> | null;
  familia: DossieFamilia;
  itens: DossieItens;
  fiscal: DossieFiscal;
  titulos: DossieTitulos;
  caixa: DossieCaixa;
  terminais: DossieTerminais;
};

export function useDossiePedido(pedidoId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["dossie-pedido", pedidoId],
    enabled: !!pedidoId && enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dossie_pedido")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Dossie | null;
    },
  });
}

export function usePedidoHipotese(pedidoId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["pedido-hipotese", pedidoId],
    enabled: !!pedidoId && enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_hipotese")
        .select("*")
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      return (data ?? []) as Hipotese[];
    },
  });
}
