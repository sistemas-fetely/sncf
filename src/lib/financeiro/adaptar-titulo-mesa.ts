import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";

/** Linha da view vw_cobranca_mesa. */
export interface LinhaMesa {
  titulo_id: string;
  numero_titulo: string | null;
  pedido_id: string | null;
  pedido: string | null;
  parceiro_id: string | null;
  nome_canonico: string | null;
  apelido: string | null;
  nome_exibicao: string | null;
  email_cliente: string | null;
  instrumento: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor_atual: number | null;
  vencimento: string | null;
  dias_atraso: number | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
  estagio: string | null;
  faturado_em: string | null;
  nf_numero: string | null;
  pacote_enviado_em: string | null;
  email_cobranca_enviado_em: string | null;
  data_proxima_acao_regua: string | null;
  pausa_regua_automatica: boolean | null;
  lastro_entrega: string | null;
  entregue_metodo: string | null;
  entregue_em: string | null;
  lastro_instrumento: string | null;
  lastro_envio: string | null;
  fila: string | null;
  acao_sugerida: string | null;
  ressalvas: string | null;
  parceiro_cnpj: string | null;
  subestado_atraso: string | null;
  vip_relacionamento: boolean | null;
  flag_bandeira_amarela: boolean | null;
  flag_grupo_economico_inadimplente: boolean | null;
  regua_elegivel?: boolean | null;
  regua_motivo_inelegivel?: string | null;
  regua_cobrar_sem_boleto?: boolean | null;
  // ── Colunas novas (entrega + falha de envio) ──
  entrega_funil_estado?: string | null;
  entrega_ocorrencia_codigo?: string | null;
  entrega_ocorrencia_texto?: string | null;
  entrega_data?: string | null;
  entrega_previsao?: string | null;
  entrega_recebedor?: string | null;
  entrega_transportadora?: string | null;
  entrega_reembarcada?: boolean | null;
  envio_falhou_em?: string | null;
  envio_falha_motivo?: string | null;
}

/**
 * Adapta a linha da Mesa para o shape que os componentes de régua já esperam.
 * Não é fonte de verdade: só preenche o que a view tem e deixa null/undefined
 * no resto (os diálogos leem apenas id, número, valor, vencimento, atraso,
 * cnpj, nomes, e-mails, tipo de pagamento e status do boleto).
 */
export function adaptarParaTitulo(l: LinhaMesa): TituloCobranca {
  return {
    id: l.titulo_id,
    numero_titulo: l.numero_titulo ?? "",
    numero_parcela: l.numero_parcela ?? 1,
    total_parcelas: l.total_parcelas ?? 1,
    valor_efetivo: Number(l.valor_atual ?? 0),
    valor_bruto: Number(l.valor_atual ?? 0),
    data_vencimento_atual: l.vencimento ?? "",
    data_vencimento_original: l.vencimento ?? "",
    dias_atraso: Number(l.dias_atraso ?? 0),
    boleto_status: l.boleto_status,
    linha_digitavel: l.linha_digitavel,
    tipo_pagamento: l.instrumento ?? "",
    pedido_id: l.pedido_id ?? "",
    parceiro_id: l.parceiro_id,
    parceiro_razao_social: l.nome_exibicao,
    parceiro_nome_fantasia: l.apelido,
    parceiro_cnpj: l.parceiro_cnpj,
    parceiro_email: l.email_cliente,
    parceiro_email_cobranca: l.email_cliente,
    nf_numero: l.nf_numero,
    pedido_estagio: l.estagio,
    data_proxima_acao_regua: l.data_proxima_acao_regua,
    pausa_regua_automatica: !!l.pausa_regua_automatica,
    subestado_atraso: (l.subestado_atraso ?? null) as TituloCobranca["subestado_atraso"],
    vip_relacionamento: l.vip_relacionamento,
    flag_bandeira_amarela: l.flag_bandeira_amarela,
    flag_grupo_economico_inadimplente: l.flag_grupo_economico_inadimplente,
    email_cobranca_enviado_em: l.email_cobranca_enviado_em,
    regua_cobrar_sem_boleto: !!l.regua_cobrar_sem_boleto,
    regua_motivo_inelegivel: l.regua_motivo_inelegivel ?? null,
  } as unknown as TituloCobranca;
}
