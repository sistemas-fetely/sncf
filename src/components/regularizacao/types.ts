export interface RegularizacaoLote {
  id: string; codigo: string; titulo: string; status: string; data_inventario: string; criado_em: string;
  observacao: string | null; centro_destino: string; centro_destino_rotulo: string; skus: number;
  pecas_inventario: number; pecas_cobertas: number; skus_descobertos: number; nfs_retorno: number;
  nfs_planejadas: number; nfs_rascunho: number; nfs_autorizadas: number; nfs_erro: number;
  valor_retorno: number; trs_pedido_id: string | null; trs_numero: string | null;
  trs_estagio: string | null; nf_6152_numero: string | null; entradas_site: number;
  modo?: string | null; nfs_origem_vinculadas?: string[] | string | null; nfs_6152_total?: number | null;
  nfs_6152_autorizadas?: number | null; nfs_6152_pendentes?: string[] | string | number | null;
  pecas_entradas?: number | null; etapa5_completa?: boolean | null;
}

export interface RemessaSaldo {
  nf_id: string; numero: string | null; data_emissao: string | null; pedido: string | null;
  centro_sugerido_codigo: string | null; centro_sugerido_rotulo: string | null;
  pecas_remetidas: number; pecas_retornadas: number; pecas_disponiveis: number; valor_disponivel: number; lotes: string | null;
}

export interface TrsNf {
  lote_id: string; nf_id: string; numero: string | null; situacao: string | null; data_emissao: string | null;
  valor_nota: number | null; pecas_nf: number | null; pecas_entradas: number | null;
}

/** Lista de NFs (array ou texto) para exibição. */
export const listaNfs = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" && v.trim() ? v.split(/[,;]\s*/).filter(Boolean) : [];

export interface RegularizacaoItem {
  id: string; lote_id: string; sku: string; quantidade: number; quantidade_coberta: number;
  cod_cadastro?: string | null; nome_comercial?: string | null;
}

export interface RegularizacaoRetornoItem {
  id: string; retorno_nf_id: string; sku: string; descricao_origem: string | null; ncm: string | null;
  unidade: string | null; quantidade: number; valor_unit_origem: number;
  cod_cadastro?: string | null; nome_comercial?: string | null;
}

export interface RegularizacaoRetorno {
  id: string; lote_id: string; nf_origem_numero: string; nf_origem_chave: string; nf_origem_data: string | null;
  linhas: number; pecas: number; valor: number; status: string; bling_nfe_id: number | null;
  nf_retorno_numero: string | null; erro: string | null; itens?: RegularizacaoRetornoItem[];
}
