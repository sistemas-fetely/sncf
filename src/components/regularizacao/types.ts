export interface RegularizacaoLote {
  id: string; codigo: string; titulo: string; status: string; data_inventario: string; criado_em: string;
  observacao: string | null; centro_destino: string; centro_destino_rotulo: string; skus: number;
  pecas_inventario: number; pecas_cobertas: number; skus_descobertos: number; nfs_retorno: number;
  nfs_planejadas: number; nfs_rascunho: number; nfs_autorizadas: number; nfs_erro: number;
  valor_retorno: number; trs_pedido_id: string | null; trs_numero: string | null;
  trs_estagio: string | null; nf_6152_numero: string | null; entradas_site: number;
}

export interface RegularizacaoItem {
  id: string; lote_id: string; sku: string; quantidade: number; quantidade_coberta: number;
  nome_comercial?: string | null;
}

export interface RegularizacaoRetornoItem {
  id: string; retorno_nf_id: string; sku: string; descricao_origem: string | null; ncm: string | null;
  unidade: string | null; quantidade: number; valor_unit_origem: number;
}

export interface RegularizacaoRetorno {
  id: string; lote_id: string; nf_origem_numero: string; nf_origem_chave: string; nf_origem_data: string | null;
  linhas: number; pecas: number; valor: number; status: string; bling_nfe_id: number | null;
  nf_retorno_numero: string | null; erro: string | null; itens?: RegularizacaoRetornoItem[];
}
