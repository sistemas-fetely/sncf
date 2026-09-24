import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * FONTE-UNICA (Casa do B2C): todo contador de aba, card do pipeline e tabela
 * lê a MESMA view. Nada de derivar contagem de outro cache.
 * Pipeline -> vw_pipeline_b2c · Fila/Drawer -> vw_gestao_b2c_pedido
 */

export interface PipelineB2cRow {
  estagio: string;
  rotulo: string | null;
  ordem: number | null;
  area: string | null;
  proxima_acao: string | null;
  visivel_no_pipeline: boolean | null;
  eh_final: boolean | null;
  eh_desvio: boolean | null;
  qtd: number | null;
  soma_valor: number | null;
  com_alerta: number | null;
  dias_medios: number | null;
}

export function usePipelineB2c() {
  return useQuery({
    queryKey: ["b2c-pipeline"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PipelineB2cRow[]> => {
      const { data, error } = await supabase
        .from("vw_pipeline_b2c")
        .select(
          "estagio, rotulo, ordem, area, proxima_acao, visivel_no_pipeline, eh_final, eh_desvio, qtd, soma_valor, com_alerta, dias_medios",
        )
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineB2cRow[];
    },
  });
}

export interface PedidoB2cRow {
  shopify_id: string | null;
  order_name: string | null;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  created_at_shopify: string | null;
  data_pedido: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_zip: string | null;
  total: number | null;
  subtotal: number | null;
  discount_amount: number | null;
  shipping_cost: number | null;
  estagio: string | null;
  estagio_rotulo: string | null;
  estagio_ordem: number | null;
  area_responsavel: string | null;
  proxima_acao: string | null;
  dias_no_estagio: number | null;
  alerta: string | null;
  na_carteira_ativa: boolean | null;
  eh_final: boolean | null;
  tem_nf: boolean | null;
  nf_refs: string | null;
  nf_data_emissao: string | null;
  bling_pedido_numero: string | null;
  tem_recebimento: boolean | null;
  liquido_mp: number | null;
  taxa_mp: number | null;
  situacao_financeira: string | null;
  xpm_codigo: string | null;
  xpm_estagio: string | null;
  xpm_farol_sla: string | null;
  xpm_horas_ciclo: number | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  rastreio_status: string | null;
  rastreio_entregue: boolean | null;
  entrega_prevista: string | null;
  shipping_method: string | null;
  payment_method: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  refunded_amount: number | null;
  coerencia_status: string | null;
  bloqueio_motivo: string | null;
  bloqueio_tentativas: number | null;
  bloqueio_em: string | null;
  pedido_ausente: boolean | null;
  // ENTRADA-B2C-POR-FASES (19/09/2026): a descida ao Bling só acontece depois
  // que o humano escolhe o CD. A fila e a escolha vêm na própria view —
  // BADGE-LÊ-A-MESMA-FONTE-DA-TELA, sem query paralela à tabela da fila.
  fila_status: string | null;
  fila_bling_pedido_id: string | null;
  // NÚMERO-CURTO-DA-FILA (19/09/2026): a edge grava o número curto do Bling
  // (ex.: 596) em bling_pedido_fila_b2c.bling_pedido_numero. A view não expõe
  // essa coluna — o hook casa direto com a tabela por shopify_pedido_id.
  fila_bling_pedido_numero: string | null;
  fila_tentativas: number | null;
  fila_ultimo_erro: string | null;
  // DEVOLVER-PARA-A-FILA (22/09/2026): o id da linha da fila do Bling não vem na
  // view — é casado aqui, e é o que a RPC de reprocesso recebe.
  fila_id: string | null;
  tag_shopify: string | null;
  cd_sugerido: string | null;
  cd_cep_codigo: string | null;
  cd_escolhido_codigo: string | null;
  cd_escolhido_nome: string | null;
  cd_cnpj_emitente: string | null;
  cd_escolhido_em: string | null;
  cd_escolhido_por: string | null;
  divergencia_tag: boolean | null;
  divergencia_cep_tag: boolean | null;
  divergencia_fiscal: boolean | null;
  horas_aguardando_cd: number | null;
  alerta_sem_cd: boolean | null;
  cd_efetivo_codigo: string | null;
  cd_efetivo_nome: string | null;
  cd_efetivo_fonte: string | null;
  // RASTREIO-NA-LINHA (22/09/2026): estado físico do objeto e fonte do estágio
  // propagados para a view — o selo de rastreio e o tooltip do estágio leem
  // daqui, sem consulta paralela.
  etiqueta_gerada_em: string | null;
  rastreio_estado: string | null;
  fase_fisica_seq: number | null;
  estagio_fonte: string | null;
  reembolso_total: number | null;
  reembolso_pendente: number | null;
  reembolso_em: string | null;
  closed_at: string | null;
  encerrado_em: string | null;
  encerrado_motivo: string | null;
}

const CAMPOS_PEDIDO =
  "shopify_id, order_name, pedido_id, id_externo, cliente, created_at_shopify, data_pedido, shipping_city, shipping_province, shipping_zip, total, subtotal, discount_amount, shipping_cost, estagio, estagio_rotulo, estagio_ordem, area_responsavel, proxima_acao, dias_no_estagio, alerta, na_carteira_ativa, eh_final, tem_nf, nf_refs, nf_data_emissao, bling_pedido_numero, tem_recebimento, liquido_mp, taxa_mp, situacao_financeira, xpm_codigo, xpm_estagio, xpm_farol_sla, xpm_horas_ciclo, tracking_number, tracking_company, tracking_url, rastreio_status, rastreio_entregue, entrega_prevista, shipping_method, payment_method, financial_status, fulfillment_status, paid_at, fulfilled_at, cancelled_at, refunded_amount, coerencia_status, bloqueio_motivo, bloqueio_tentativas, bloqueio_em, pedido_ausente, fila_status, fila_bling_pedido_id, fila_tentativas, fila_ultimo_erro, tag_shopify, cd_sugerido, cd_cep_codigo, cd_escolhido_codigo, cd_escolhido_nome, cd_cnpj_emitente, cd_escolhido_em, cd_escolhido_por, divergencia_tag, divergencia_cep_tag, divergencia_fiscal, horas_aguardando_cd, alerta_sem_cd, cd_efetivo_codigo, cd_efetivo_nome, cd_efetivo_fonte, etiqueta_gerada_em, rastreio_estado, fase_fisica_seq, estagio_fonte, reembolso_total, reembolso_pendente, reembolso_em, closed_at, encerrado_em, encerrado_motivo";

export function usePedidosB2c() {
  return useQuery({
    queryKey: ["b2c-pedidos"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoB2cRow[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_b2c_pedido")
        .select(CAMPOS_PEDIDO)
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as PedidoB2cRow[];
      // NÚMERO-CURTO-DA-FILA: a view não expõe bling_pedido_numero da fila —
      // consulta complementar por shopify_pedido_id e casamento em memória.
      // FAIL-LOUD: erro na consulta complementar derruba a query como um todo.
      const ids = rows
        .map((r) => r.shopify_id)
        .filter((x): x is string => !!x);
      if (ids.length > 0) {
        const { data: filaNumeros, error: erroFila } = await supabase
          .from("bling_pedido_fila_b2c")
          .select("id, shopify_pedido_id, bling_pedido_numero")
          .in("shopify_pedido_id", ids);
        if (erroFila) throw erroFila;
        const mapa = new Map(
          (filaNumeros ?? []).map((r) => [
            r.shopify_pedido_id as string,
            r as { id: string; bling_pedido_numero: string | null },
          ]),
        );
        for (const r of rows) {
          const linha = r.shopify_id ? mapa.get(r.shopify_id) : undefined;
          r.fila_bling_pedido_numero = linha?.bling_pedido_numero ?? null;
          r.fila_id = linha?.id ?? null;
        }
      }
      return rows;
    },
  });
}

export interface AlertaDim {
  codigo: string;
  rotulo: string | null;
  severidade: string | null;
  prioridade: number | null;
  ativo: boolean | null;
}

export function usePedidoAlertaDim() {
  return useQuery({
    queryKey: ["pedido-alerta-dim"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<AlertaDim[]> => {
      const { data, error } = await supabase
        .from("pedido_alerta_dim")
        .select("codigo, rotulo, severidade, prioridade, ativo")
        .eq("ativo", true)
        .order("prioridade", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AlertaDim[];
    },
  });
}

export interface ItemB2c {
  id: string;
  line_item_id: number | null;
  sku: string | null;
  product_name: string | null;
  quantity: number;
  current_quantity: number | null;
  unit_price: number;
}

export function useItensB2c(shopifyId: string | null) {
  return useQuery({
    queryKey: ["b2c-itens", shopifyId],
    enabled: !!shopifyId,
    queryFn: async (): Promise<ItemB2c[]> => {
      const { data, error } = await supabase
        .from("shopify_itens")
        .select("id, line_item_id, sku, product_name, quantity, current_quantity, unit_price")
        .eq("pedido_id", shopifyId!);
      if (error) throw error;
      return (data ?? []) as ItemB2c[];
    },
  });
}

/**
 * Desfaz a escolha do CD enquanto a fila está pendente (antes do cron levar
 * ao Bling). FAIL-LOUD: lança Error com a mensagem real do banco.
 */
export async function desfazerEscolhaCd(shopifyId: string): Promise<void> {
  const { data, error } = await supabase.rpc("fn_b2c_desfazer_escolha_cd", {
    p_shopify_id: shopifyId,
  });
  if (error) throw new Error(error.message);
  const r = data as { ok?: boolean; status?: string } | null;
  if (r && r.ok === false) {
    throw new Error(`A escolha não pôde ser desfeita (fila: ${r.status ?? "desconhecida"}).`);
  }
}

/** Resposta da RPC de reprocesso da fila. */
export interface ReprocessoFilaB2c {
  ok: boolean;
  fila: string;
  devolvidos: number;
  pedidos_informados: number;
  ignorados: number;
  nota: string | null;
}

/**
 * DEVOLVER-PARA-A-FILA (22/09/2026): pedido em erro fica parado para sempre — o
 * cron só olha `pendente`. A RPC devolve para `pendente` só quem está em erro ou
 * pausado e grava o motivo no último erro. FAIL-LOUD: mensagem real do banco.
 */
export async function reprocessarFilaB2c(
  ids: string[],
  fila: "bling" | "xpm",
  motivo: string,
): Promise<ReprocessoFilaB2c> {
  const { data, error } = await supabase.rpc("fn_fila_b2c_reprocessar", {
    p_ids: ids,
    p_fila: fila,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("A função não devolveu resposta.");
  return data as unknown as ReprocessoFilaB2c;
}

/**
 * DIMENSÃO-VIA-TABELA: os CDs válidos para o B2C são os que têm loja no Bling.
 * Nunca lista fixa no código.
 */
export interface CentroB2c {
  codigo: string;
  nome: string;
  loja_bling_id: number | null;
  cnpj_emitente: string | null;
}

export function useCentrosB2c() {
  return useQuery({
    queryKey: ["b2c-centros"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CentroB2c[]> => {
      const { data, error } = await supabase
        .from("centro_distribuicao")
        .select("codigo, nome, loja_bling_id, cnpj_emitente")
        .eq("ativo", true)
        .not("loja_bling_id", "is", null)
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CentroB2c[];
    },
  });
}

/** Status do cron de descida ao Bling (rodapé da aba Fila).
 *  Fonte: RPC fn_b2c_sinc_status (banco pronto, 1 linha). Se falhar, a tela
 *  simplesmente não mostra o rodapé — decisão explícita da frente, não é erro
 *  de operador. */
export interface SincBlingStatus {
  job_nome: string | null;
  schedule: string | null;
  ultimo_em: string | null;
  ultimo_status: string | null;
  proximo_em: string | null;
  segundos_ate_proximo: number | null;
  fila_pendentes: number | null;
  fila_erro: number | null;
}

export function useSincStatusBling() {
  return useQuery({
    queryKey: ["b2c-sinc-status"],
    refetchInterval: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<SincBlingStatus | null> => {
      const { data, error } = await supabase.rpc("fn_b2c_sinc_status");
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      return (linha ?? null) as SincBlingStatus | null;
    },
  });
}

// ── SENTINELA-B2C · 22/09/2026 ─────────────────────────────────────────────
// A view vw_gestao_b2c_pedido custa ~2,9s por execução, então NÃO existe
// refetchInterval nela. Pedido novo nasce de webhook Shopify (nenhuma mutation
// do sistema invalida o cache) e o QueryClient global usa staleTime Infinity —
// sem sentinela, o operador fica olhando fila vazia achando que não tem
// trabalho. Esta RPC é barata (~4ms): só avisa que algo mudou. Quem decide
// recarregar a view pesada é o humano, no clique.
export interface SinalB2c {
  pedidos_qtd: number;
  pedidos_max: string | null;
  fila_qtd: number;
  fila_hash: string | null;
  em: string | null;
}

/** Compara só o conteúdo do sinal, ignorando `em` (que muda a cada chamada). */
export function sinalMudou(a: SinalB2c | null | undefined, b: SinalB2c | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.pedidos_qtd !== b.pedidos_qtd ||
    a.pedidos_max !== b.pedidos_max ||
    a.fila_qtd !== b.fila_qtd ||
    a.fila_hash !== b.fila_hash
  );
}

export function useSinalB2c() {
  return useQuery({
    queryKey: ["b2c-sinal"],
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<SinalB2c | null> => {
      const { data, error } = await supabase.rpc("fn_b2c_fila_sinal");
      if (error) throw error;
      return (data ?? null) as unknown as SinalB2c | null;
    },
  });
}
