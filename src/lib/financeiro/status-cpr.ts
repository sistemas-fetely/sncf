/**
 * Status do ciclo de vida de `contas_pagar_receber.status`.
 *
 * Fonte única de verdade para rótulo e estilo do badge — não duplicar
 * este mapa em telas. Se aparecer chave desconhecida, `getStatusCprMeta`
 * devolve fallback neutro (nunca undefined).
 *
 * Domínio válido (CHECK atual, 8 valores):
 * - `aberto`                  → neutro (título registrado, ainda não fluiu)
 * - `aprovado`                → progresso / azul
 * - `enviado_para_pagamento`  → progresso mais forte / azul
 * - `pago`                    → sucesso / verde
 * - `conciliado`              → sucesso confirmado / verde escuro
 * - `cancelado`               → muted / riscado
 * - `doc_pendente`            → âmbar (falta documento fiscal)
 * - `previsto`                → slate tracejado — é PREVISÃO, não dívida
 *
 * Valores LEGADO (não devem mais aparecer). Se aparecerem, GRITAR em vermelho:
 * `paga`, `rascunho`, `agendado`, `atrasado`, `realizada`, `aguardando_pagamento`.
 */
export type StatusCprMeta = {
  label: string;
  className: string;
};

export const STATUS_CPR_VALIDOS = [
  "aberto",
  "aprovado",
  "enviado_para_pagamento",
  "pago",
  "conciliado",
  "cancelado",
  "doc_pendente",
  "previsto",
] as const;

export type StatusCpr = (typeof STATUS_CPR_VALIDOS)[number];

const VALIDOS: Record<StatusCpr, StatusCprMeta> = {
  aberto: {
    label: "Aberto",
    className: "bg-muted/10 text-muted-foreground border-border/40 hover:bg-muted/10",
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-info/10 text-info border-info/40 hover:bg-info/10",
  },
  enviado_para_pagamento: {
    label: "Enviado p/ pagamento",
    className: "bg-info text-white border-transparent hover:bg-info",
  },
  pago: {
    label: "Pago",
    className: "bg-success/10 text-success border-success/40 hover:bg-success/10",
  },
  conciliado: {
    label: "Conciliado",
    className: "bg-success text-white border-transparent hover:bg-success",
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-muted text-muted-foreground border-border line-through hover:bg-muted",
  },
  doc_pendente: {
    label: "Doc pendente",
    className: "bg-warning/10 text-warning border-warning/40 hover:bg-warning/10",
  },
  previsto: {
    label: "Previsto",
    className:
      "bg-muted/10 text-muted-foreground border border-dashed border-border/40 hover:bg-muted/10",
  },
};

/**
 * Status LEGADO — aposentados do CHECK. Se algum registro renderizar com
 * um destes, é bug de dados ou de código velho. Estilo destrutivo para gritar.
 */
const LEGADO: Record<string, StatusCprMeta> = {
  paga: {
    label: "legado: paga",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
  rascunho: {
    label: "legado: rascunho",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
  agendado: {
    label: "legado: agendado",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
  atrasado: {
    label: "legado: atrasado",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
  realizada: {
    label: "legado: realizada",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
  aguardando_pagamento: {
    label: "legado: aguardando_pagamento",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
};

export const STATUS_CPR_META: Record<string, StatusCprMeta> = {
  ...VALIDOS,
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
