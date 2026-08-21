import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoEntrega {
  pedido_id: string;
  id_externo: string | null;
  estagio: string | null;
  entregue_em: string | null;
  data_entrega: string | null;
  entregue_metodo: string | null;
  data_entrega_prevista: string | null;
  dias_vs_previsto: number | null;
  transportadora_id: string | null;
  transportadora_nome: string | null;
  transportadora_razao: string | null;
  transportadora_cnpj: string | null;
  frete_tipo: string | null;
  valor_frete: number | null;
  estimativa_frete_valor: number | null;
  frete_responsavel: string | null;
  transporte_origem: string | null;
  transportadora_origem: string | null;
  nf_numero: string | null;
  nf_data: string | null;
  eventos_rastreio: unknown;
  // Novas colunas vindas de transp_fretes (fatura real)
  custo_frete_real: number | null;
  margem_frete: number | null;
  cte_numero: string | null;
  frete_qtd_ctes: number | null;
  volumes: number | null;
  peso_real: number | null;
  peso_taxado: number | null;
  pct_frete_nf: number | null;
  prazo_transportadora: string | null;
  entrega_ocorrencia_texto: string | null;
  entrega_ocorrencia_classe: string | null;
  entrega_ocorrencia_problema: boolean | null;
  data_entrega_transportadora: string | null;
}

export function usePedidoEntrega(pedidoId: string | undefined, estagio: string | undefined) {
  const enabled = !!pedidoId && estagio === "entregue";
  return useQuery({
    queryKey: ["pedido-entrega", pedidoId],
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_entrega")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as PedidoEntrega | null;
    },
  });
}

export interface EntregaLinhaInfo {
  estagio: string | null;
  transporte_origem: string | null;
  entregue_em: string | null;
  entregue_metodo: string | null;
  transportadora_nome: string | null;
  transportadora_apelido: string | null;
  data_entrega_transportadora: string | null;
  data_entrega_prevista: string | null;
  prazo_transportadora: string | null;
  entrega_ocorrencia_texto: string | null;
  entrega_ocorrencia_codigo: string | null;
  entrega_ocorrencia_classe: string | null;
  entrega_ocorrencia_problema: boolean | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave: string | null;
  nf_pdf_url: string | null;
  nf_data_emissao: string | null;
  nf_situacao: string | null;
  nf_id: string | null;
  nf_bling_id: string | null;
  // PREVISAO-VEM-DO-BANCO (21/08/2026)
  previsao_entrega: string | null;
  previsao_fonte: string | null;
  previsao_confianca: string | null;
  previsao_motivo_sem_data: string | null;
  dias_vs_meta: number | null;
  meta_provisoria: boolean | null;
  meta_original: string | null;
  transito_dias: number | null;
  transito_fonte: string | null;
}



/**
 * Versão em lote para a fila de pedidos.
 * Junta vw_pedido_entrega (dados de entrega) com nfs_emitidas (NF real).
 * ATENÇÃO: vw_pedido_entrega.nf_numero está quebrado — não é usado aqui.
 */
export function usePedidosEntregaLote(pedidoIds: string[]) {
  const ids = [...pedidoIds].sort();
  return useQuery({
    queryKey: ["pedidos-fila", "entrega-lote", ids],
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, EntregaLinhaInfo>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [entregaRes, nfRes] = await Promise.all([
        sb
          .from("vw_pedido_entrega")
          .select(
            "pedido_id, estagio, transporte_origem, entregue_em, entregue_metodo, transportadora_nome, transportadora_apelido, transportadora_razao, data_entrega_transportadora, data_entrega_prevista, prazo_transportadora, entrega_ocorrencia_texto, entrega_ocorrencia_codigo, entrega_ocorrencia_classe, entrega_ocorrencia_problema, previsao_entrega, previsao_fonte, previsao_confianca, previsao_motivo_sem_data, dias_vs_meta, meta_provisoria, meta_original, transito_dias, transito_fonte",
          )
          .in("pedido_id", ids),
        sb
          .from("nfs_emitidas")
          .select("id, bling_id, pedido_venda_id, numero, serie, chave_acesso, pdf_url, data_emissao, situacao")
          .in("pedido_venda_id", ids)
          .order("data_emissao", { ascending: false }),
      ]);
      if (entregaRes.error) throw entregaRes.error;
      if (nfRes.error) throw nfRes.error;

      const nfMap = new Map<
        string,
        {
          numero: string | null;
          serie: string | null;
          chave: string | null;
          pdf: string | null;
          data: string | null;
          id: string | null;
          bling_id: string | null;
          situacao: string | null;
        }
      >();
      // Escolha da NF por pedido: prefere 'autorizada'; senão a mais recente
      // por data_emissao (a query já vem ordenada desc).
      const ts = (v: unknown) => {
        const t = v ? Date.parse(String(v)) : NaN;
        return Number.isNaN(t) ? -Infinity : t;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const melhorNf = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (nfRes.data || []) as any[]) {
        if (!r.pedido_venda_id) continue;
        const atual = melhorNf.get(r.pedido_venda_id);
        if (!atual) {
          melhorNf.set(r.pedido_venda_id, r);
          continue;
        }
        const autA = atual.situacao === "autorizada";
        const autR = r.situacao === "autorizada";
        if (autR && !autA) melhorNf.set(r.pedido_venda_id, r);
        else if (autR === autA && ts(r.data_emissao) > ts(atual.data_emissao)) {
          melhorNf.set(r.pedido_venda_id, r);
        }
      }
      for (const [pid, r] of melhorNf.entries()) {
        nfMap.set(pid, {
          numero: r.numero ?? null,
          serie: r.serie ?? null,
          chave: r.chave_acesso ?? null,
          pdf: r.pdf_url ?? null,
          data: r.data_emissao ?? null,
          id: r.id ?? null,
          bling_id: r.bling_id ?? null,
          situacao: r.situacao ?? null,
        });
      }

      const m = new Map<string, EntregaLinhaInfo>();
      const put = (pid: string, patch: Partial<EntregaLinhaInfo>) => {
        const base: EntregaLinhaInfo = m.get(pid) ?? {
          estagio: null,
          transporte_origem: null,
          entregue_em: null,
          entregue_metodo: null,
          transportadora_nome: null,
          transportadora_apelido: null,
          data_entrega_transportadora: null,
          data_entrega_prevista: null,
          prazo_transportadora: null,
          entrega_ocorrencia_texto: null,
          entrega_ocorrencia_codigo: null,
          entrega_ocorrencia_classe: null,
          entrega_ocorrencia_problema: null,
          nf_numero: null,
          nf_serie: null,
          nf_chave: null,
          nf_pdf_url: null,
          nf_data_emissao: null,
          nf_situacao: null,
          nf_id: null,
          nf_bling_id: null,
          previsao_entrega: null,
          previsao_fonte: null,
          previsao_confianca: null,
          previsao_motivo_sem_data: null,
          dias_vs_meta: null,
          meta_provisoria: null,
          meta_original: null,
          transito_dias: null,
          transito_fonte: null,
        };
        m.set(pid, { ...base, ...patch });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (entregaRes.data || []) as any[]) {
        if (!r.pedido_id) continue;
        put(r.pedido_id, {
          estagio: r.estagio ?? null,
          transporte_origem: r.transporte_origem ?? null,
          entregue_em: r.entregue_em ?? null,
          entregue_metodo: r.entregue_metodo ?? null,
          transportadora_nome: r.transportadora_nome ?? r.transportadora_razao ?? null,
          transportadora_apelido: r.transportadora_apelido ?? null,
          data_entrega_transportadora: r.data_entrega_transportadora ?? null,
          data_entrega_prevista: r.data_entrega_prevista ?? null,
          prazo_transportadora: r.prazo_transportadora ?? null,
          entrega_ocorrencia_texto: r.entrega_ocorrencia_texto ?? null,
          entrega_ocorrencia_codigo: r.entrega_ocorrencia_codigo ?? null,
          entrega_ocorrencia_classe: r.entrega_ocorrencia_classe ?? null,
          entrega_ocorrencia_problema: r.entrega_ocorrencia_problema ?? null,
          previsao_entrega: r.previsao_entrega ?? null,
          previsao_fonte: r.previsao_fonte ?? null,
          previsao_confianca: r.previsao_confianca ?? null,
          previsao_motivo_sem_data: r.previsao_motivo_sem_data ?? null,
          dias_vs_meta: r.dias_vs_meta ?? null,
          meta_provisoria: r.meta_provisoria ?? null,
          meta_original: r.meta_original ?? null,
          transito_dias: r.transito_dias ?? null,
          transito_fonte: r.transito_fonte ?? null,
        });
      }
      for (const [pid, nf] of nfMap.entries()) {
        put(pid, {
          nf_numero: nf.numero,
          nf_serie: nf.serie,
          nf_chave: nf.chave,
          nf_pdf_url: nf.pdf,
          nf_data_emissao: nf.data,
          nf_situacao: nf.situacao,
          nf_id: nf.id,
          nf_bling_id: nf.bling_id,
        });
      }
      // Garante entrada para todo pedido pedido (para render de lacunas)
      for (const pid of ids) if (!m.has(pid)) put(pid, {});
      return m;
    },
  });
}

