/**
 * Estágios do ciclo de vida da despesa (`vw_despesas_v2.estagio`).
 *
 * Fonte única de verdade para rótulo e estilo do badge — não duplicar
 * este mapa em telas. Se aparecer chave desconhecida, `getEstagioMeta`
 * devolve fallback neutro (nunca undefined).
 *
 * Semântica das cores (não inverter):
 * - `completa`            → sucesso / verde
 * - `aguardando_pagamento` → atenção / âmbar
 * - `parcialmente_pago`    → informativo / azul
 * - `em_conta_corrente`    → NEUTRO / slate (obrigação normal, saldo mora
 *                            no livro do fornecedor; NÃO é dívida vencida)
 * - `sem_documento`        → laranja
 * - `a_classificar`        → muted / cinza
 * - `indefinido`           → destrutivo / vermelho (sentinela de erro)
 */
export type EstagioMeta = {
  label: string;
  className: string;
};

export const ESTAGIO_META: Record<string, EstagioMeta> = {
  completa: {
    label: "completa",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent",
  },
  aguardando_pagamento: {
    label: "aguarda pgto",
    className: "bg-amber-100 text-amber-800 border-amber-400",
  },
  parcialmente_pago: {
    label: "parcial",
    className: "bg-blue-50 text-blue-700 border-blue-400",
  },
  em_conta_corrente: {
    label: "conta corrente",
    className: "bg-slate-100 text-slate-700 border-slate-300",
  },
  sem_documento: {
    label: "sem documento",
    className: "bg-orange-100 text-orange-800 border-orange-400",
  },
  a_classificar: {
    label: "a classificar",
    className: "bg-muted text-muted-foreground border-border",
  },
  indefinido: {
    label: "indefinido",
    className: "bg-destructive text-destructive-foreground border-transparent",
  },
};

const FALLBACK: EstagioMeta = {
  label: "—",
  className: "bg-muted text-muted-foreground border-border",
};

export function getEstagioMeta(estagio: string | null | undefined): EstagioMeta {
  if (!estagio) return FALLBACK;
  const hit = ESTAGIO_META[estagio];
  if (hit) return hit;
  return {
    label: estagio,
    className: "bg-muted text-muted-foreground border-border",
  };
}
