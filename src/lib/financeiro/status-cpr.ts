/**
 * Status do ciclo de vida de `contas_pagar_receber.status`.
 *
 * ATENÇÃO — ESTE ARQUIVO É TRANSITÓRIO (correção emergencial 02/09/2026).
 * A fonte de verdade de rótulo, cor e ordem passou a ser a tabela
 * `titulo_pagar_estado_dim` no banco (decisão "opção A: o banco manda").
 * Este mapa existe só para não quebrar as telas até a reforma ESTADO × PROVAS
 * substituir tudo por um hook que lê a dimensão. Não acrescentar estado aqui:
 * acrescente na tabela.
 *
 * Trilho vigente do TÍTULO A PAGAR (titulo_pagar_estado_dim, ordem):
 *   rascunho → aberto → aprovado → programado → pago → conciliado
 *   fora da linha: cancelado (terminal), contestado
 *
 * Os rótulos seguem a dimensão, não o slug:
 *   `aberto`     → "A aprovar"  (slug legado preservado de propósito)
 *   `conciliado` → "Provado"    (idem — é sobre a prova, não sobre conciliação)
 *
 * APOSENTADOS (existem no CHECK, saem do trilho — ainda têm produtores vivos
 * até a Fatia 1c desligá-los). Estilo âmbar: não é erro, é dívida.
 *   `enviado_para_pagamento`, `doc_pendente`, `previsto`
 *
 * LEGADO DE VERDADE (nunca devem aparecer — se aparecerem, GRITAR):
 *   `paga`, `atrasado`, `realizada`, `aguardando_pagamento`, `agendado`
 *   (`agendado` foi renomeado para `programado` em 02/09/2026, antes de
 *    qualquer uso — se aparecer, é código velho.)
 */
export type StatusCprMeta = {
  label: string;
  className: string;
};

export const STATUS_CPR_VALIDOS = [
  "rascunho",
  "aberto",
  "aprovado",
  "programado",
  "pago",
  "conciliado",
  "cancelado",
  "contestado",
] as const;

export type StatusCpr = (typeof STATUS_CPR_VALIDOS)[number];

const VALIDOS: Record<StatusCpr, StatusCprMeta> = {
  rascunho: {
    label: "Rascunho",
    className: "bg-muted/10 text-muted-foreground border-dashed border-border/40 hover:bg-muted/10",
  },
  aberto: {
    label: "A aprovar",
    className: "bg-muted/10 text-muted-foreground border-border/40 hover:bg-muted/10",
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-info/10 text-info border-info/40 hover:bg-info/10",
  },
  programado: {
    label: "Programado",
    className: "bg-info text-white border-transparent hover:bg-info",
  },
  pago: {
    label: "Pago",
    className: "bg-success/10 text-success border-success/40 hover:bg-success/10",
  },
  conciliado: {
    label: "Provado",
    className: "bg-success text-white border-transparent hover:bg-success",
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-muted text-muted-foreground border-border line-through hover:bg-muted",
  },
  contestado: {
    label: "Contestado",
    className: "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/10",
  },
};

/**
 * APOSENTADOS — no CHECK, fora do trilho. Ainda aparecem enquanto os produtores
 * vivos não forem desligados (Fatia 1c). Âmbar: sinaliza dívida, não erro.
 */
const APOSENTADO: Record<string, StatusCprMeta> = {
  enviado_para_pagamento: {
    label: "Enviado p/ pagamento (aposentado)",
    className: "bg-warning/10 text-warning border-warning/40 hover:bg-warning/10",
  },
  doc_pendente: {
    label: "Doc pendente (aposentado)",
    className: "bg-warning/10 text-warning border-warning/40 hover:bg-warning/10",
  },
  previsto: {
    label: "Previsto (aposentado)",
    className: "bg-warning/10 text-warning border-dashed border-warning/40 hover:bg-warning/10",
  },
};

/**
 * LEGADO — aposentados do CHECK. Se algum registro renderizar com um destes,
 * é bug de dados ou de código velho. Estilo destrutivo para gritar.
 */
const LEGADO: Record<string, StatusCprMeta> = {
  paga: { label: "legado: paga", className: "bg-destructive text-destructive-foreground border-transparent" },
  agendado: { label: "legado: agendado", className: "bg-destructive text-destructive-foreground border-transparent" },
  atrasado: { label: "legado: atrasado", className: "bg-destructive text-destructive-foreground border-transparent" },
  realizada: { label: "legado: realizada", className: "bg-destructive text-destructive-foreground border-transparent" },
  aguardando_pagamento: { label: "legado: aguardando_pagamento", className: "bg-destructive text-destructive-foreground border-transparent" },
};

/**
 * Lista para o FILTRO de tela: trilho + aposentados.
 * Os aposentados precisam ser filtráveis porque ainda NASCEM hoje
 * (`executar_pagamento`, `aprovar_cpr_em_cascata` e o botão Aprovar do cartão
 * ainda gravam `enviado_para_pagamento`). Some da lista = some da tela.
 * Quando a Fatia 1c desligar os produtores, tirar daqui.
 */
export const STATUS_CPR_FILTRAVEIS = [
  ...STATUS_CPR_VALIDOS,
  "enviado_para_pagamento",
  "doc_pendente",
  "previsto",
] as const;

export const STATUS_CPR_META: Record<string, StatusCprMeta> = {
  ...VALIDOS,
  ...APOSENTADO,
  ...LEGADO,
};

const FALLBACK: StatusCprMeta = {
  label: "—",
  className: "bg-muted text-muted-foreground border-border",
};

export function getStatusCprMeta(status: string | null | undefined): StatusCprMeta {
  if (!status) return FALLBACK;
  const hit = STATUS_CPR_META[status];
  if (hit) return hit;
  return {
    label: status,
    className: "bg-destructive text-destructive-foreground border-transparent",
  };
}
