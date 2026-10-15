import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface RemessaRow {
  grao: "pedido" | "nf_orfa" | "postagem_orfa" | "cte_orfa";
  pedido_id: string | null; referencia: string; canal: "b2b" | "b2c" | "interno"; estagio: string | null;
  parceiro_id: string | null; cliente: string | null;
  transportadora_id: string | null; transportadora: string;
  data_despacho: string | null; mes: string | null; uf_destino: string | null; cidade_destino: string | null;
  valor_mercadoria: number | null; nfs: number;
  receita_frete: number; custo_frete: number; custo_fatura: number; custo_api: number; custo_postagem: number; custo_estimado: number | null;
  custo_fonte: "fatura" | "api" | "postagem" | "estimativa" | "sem_custo"; custo_real: boolean; margem_frete: number;
  docs_custo: number; custo_atualizado_em: string | null;
  entregue_em: string | null; entregue_metodo: string | null; previsao_entrega: string | null;
  estado_canonico: string | null; estado_rotulo: string | null; eh_problema: boolean; ordem_urgencia: number | null;
  ultima_ocorrencia_em: string | null; ultima_ocorrencia_texto: string | null; dias_sem_movimento: number | null;
  no_prazo: boolean | null; dias_entrega: number | null; tem_nf: boolean; tem_rastreio: boolean;
}
export interface FiltroRemessas { transportadoraId?: string | null; canal?: "b2b" | "b2c" | "interno" | null; de?: string | null; ate?: string | null; soPedidos?: boolean }

export function useLogisticaRemessas(f: FiltroRemessas) {
  return useQuery({
    queryKey: ["logistica", "remessas", f.transportadoraId ?? null, f.canal ?? null, f.de ?? null, f.ate ?? null, f.soPedidos ?? true],
    queryFn: async (): Promise<RemessaRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("vw_logistica_remessa").select("*").order("data_despacho", { ascending: false, nullsFirst: false }).limit(5000);
      if (f.soPedidos !== false) q = q.eq("grao", "pedido");
      if (f.transportadoraId) q = q.eq("transportadora_id", f.transportadoraId);
      if (f.canal) q = q.eq("canal", f.canal);
      if (f.de) q = q.gte("data_despacho", f.de);
      if (f.ate) q = q.lte("data_despacho", f.ate);
      const { data, error } = await q;
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as RemessaRow[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export interface RemessaDetalhe {
  remessa: RemessaRow | null;
  nfs: { nf_id: string; numero: string; serie: string | null; situacao: string; emissao: string; valor_nota: number | null; valor_frete: number | null; transportadora_nf: string | null; chave: string | null }[];
  documentos_frete: DocumentoFreteRow[];
  cte_api: { nf_numero: string; cte_numero: string | null; valor_cte: number | null; tipo_frete: string | null; status: string | null; previsao_entrega: string | null; data_entrega: string | null; recebedor: string | null; ultimo_evento: string | null; ultimo_evento_em: string | null; origem_dado: string; ocorrencia_codigo: string | null; divergencia: boolean | null; sync_erro: string | null; timeline: { data: string | null; descricao: string | null }[] }[];
  rastreio_postal: { codigo: string; servico: string | null; status: string | null; estado: string | null; previsao_entrega: string | null; entregue: boolean | null; entregue_em: string | null; atualizado_em: string | null; eventos: unknown[] }[];
}
export function useRemessaDetalhe(pedidoId: string | null) {
  return useQuery({
    queryKey: ["logistica", "remessa-detalhe", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<RemessaDetalhe> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_logistica_remessa_detalhe", { p_pedido_id: pedidoId });
      if (error) throw new Error(humanizeError(error.message));
      return data as RemessaDetalhe;
    },
  });
}

export interface DocumentoFreteRow {
  tipo_doc: "cte" | "postagem"; doc_id: string; transportadora_id: string | null; transportadora: string | null; canal: string;
  numero: string | null; serie: string | null; minuta: string | null; data_doc: string | null; emissao: string | null; natureza: string | null;
  nf_numero: string | null; nf_numeros: string[] | null; pedido_id: string | null; pedido_ref: string | null; status_vinculo: string | null;
  destinatario: string | null; cidade_destino: string | null; uf_destino: string | null;
  volumes: number | null; peso_real: number | null; peso_taxado: number | null; valor_nf: number | null; valor_doc: number | null;
  composicao: Record<string, number | string>; pct_frete_nf: number | null;
  ocorrencia_codigo: string | null; ocorrencia_texto: string | null; ocorrencia_em: string | null;
  auditoria_status: "ok" | "acima_referencia" | "sem_referencia" | "justificar" | null; auditoria_motivo: string | null;
  auditoria_referencia: number | null; auditoria_razao: number | null; importado_arquivo: string | null; importado_em: string | null;
}
export function useDocumentosFrete(transportadoraId: string | null, de?: string | null) {
  return useQuery({
    queryKey: ["logistica", "documentos-frete", transportadoraId, de ?? null],
    queryFn: async (): Promise<DocumentoFreteRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("vw_logistica_documento_frete").select("*").order("data_doc", { ascending: false, nullsFirst: false }).limit(5000);
      if (transportadoraId) q = q.eq("transportadora_id", transportadoraId);
      if (de) q = q.gte("data_doc", de);
      const { data, error } = await q;
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as DocumentoFreteRow[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
