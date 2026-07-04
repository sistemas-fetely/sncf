/**
 * Tipos compartilhados pelos importadores financeiros
 */

export interface ItemNFParsed {
  codigo_produto?: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  valor_icms?: number;
  valor_pis?: number;
  valor_cofins?: number;

  // Categoria por item (quando expandido)
  _plano_contas_id?: string | null;
  _categoria_nome?: string | null;
  _centro_custo?: string | null;
  _centro_custo_id?: string | null;
  _regra_origem?: "parceiro" | "ncm" | "texto" | "manual" | null;
}

export interface NFParsed {
  // Identificação NF
  nf_chave_acesso?: string;
  nf_numero?: string;
  nf_serie?: string;
  nf_data_emissao?: string | null;
  nf_data_vencimento?: string | null;
  nf_natureza_operacao?: string;
  nf_cfop?: string;
  nf_ncm?: string;

  // Fornecedor
  fornecedor_nome: string;
  fornecedor_cnpj?: string;

  // Valores
  valor: number;
  nf_valor_produtos?: number;
  nf_valor_impostos?: number;

  // Pagamento
  meio_pagamento?: string | null;

  // Status / origem
  status_nf?: string;

  // Itens (CSV detalhado, XML, PDF detalhado)
  itens?: ItemNFParsed[];

  // Campos calculados/internos
  _selecionada?: boolean;
  _duplicata?: boolean;
  _ambigua?: boolean; // score 2 — pergunta no preview
  _ja_existe?: boolean; // já existe no banco (match exato)
  _candidatos_match?: {
    id: string;
    score: number;
    fornecedor: string;
    nf_numero: string;
    valor: number;
    data_emissao: string | null;
    tipo_documento: string;
    parcela: string | null;
  }[];
  _plano_contas_id?: string | null;
  _categoria_nome?: string | null;
  _centro_custo?: string | null;
  _centro_custo_id?: string | null;
  _regra_origem?: "parceiro" | "ncm" | "texto" | null;

  // Quando true, importação usa categoria por item (campo `_plano_contas_id` de cada item)
  _expandirItens?: boolean;

  // Match com pagamento existente (ao invés de criar nova conta, vincula NF)
  _match_pagamento?: {
    conta_id: string;
    score: number;
    conta_descricao: string;
    conta_status: string;
    conta_docs_status: string | null;
    conta_plano_contas_id?: string | null;
  } | null;

  // Metadado de origem do import
  _source: "csv_qive" | "xml_nfe" | "xml_nfse" | "pdf_nfe";

  // Tipo de documento fiscal (preenchido pelo dispatcher xml-parser ou edge function de PDF)
  tipo_documento?: "nfe" | "nfse" | "recibo" | "boleto" | string;
  pais_emissor?: string;
  moeda?: string;
  valor_origem?: number | null;
  taxa_conversao?: number | null;

  // Boleto (linha digitável FEBRABAN + parcelas)
  linha_digitavel?: string | null;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  numero_documento_referencia?: string | null;

  // Confiança da classificação pela IA (baixa = mostrar selector pro usuário)
  confianca?: "alta" | "baixa";

  // Arquivo original (apenas PDFs - usado para anexar à conta criada)
  _arquivo?: File;

  // Parceiro_id resolvido após auto-cadastro (sobrescreve a busca por CNPJ no import-handler)
  _parceiro_id_resolvido?: string;
}

export interface RegraCategorizacao {
  id: string;
  fornecedor_id: string | null;
  parceiro_id: string | null;
  cnpj_emitente: string | null;
  ncm_prefixo: string | null;
  descricao_contem: string | null;
  plano_contas_id: string;
  centro_custo_id: string | null;
  prioridade: number;
  ativo: boolean;
  conta?: { id: string; codigo: string; nome: string } | null;
}
