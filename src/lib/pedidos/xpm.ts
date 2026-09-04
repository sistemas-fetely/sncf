/** Prefixo gravado pela edge quando o bloqueio é NOSSO (a XPM nem foi chamada). */
export const PREFIXO_PRE_VOO = "Bloqueado antes do envio · ";

/**
 * CONTRATO DE NÍVEL — helper ÚNICO: o rótulo da alçada nasce do `nivel_ref`
 * que o banco devolve, nunca de um mapa espalhado pelos componentes.
 */
export function rotuloAlcadaNivel(nivel: number | null | undefined): string {
  switch (nivel) {
    case 3: return "Ação de coordenador";
    case 4: return "Ação de gerente";
    case 5: return "Ação de diretor";
    default: return "Ação restrita";
  }
}

/**
 * O botão não pode chamar duas decisões pelo mesmo nome: forçar contra falta
 * real e priorizar a fila são coisas diferentes.
 */
export function rotuloBotaoOverrideEstoque(veredito: string | null | undefined): string {
  return veredito === "falta_real" ? "Forçar envio mesmo assim" : "Liberar e enviar";
}

export const PLACEHOLDER_MOTIVO_FALTA_REAL =
  "Ex.: item chega esta semana pela MIRA-2026-001, adiantando a separação dos outros itens";

export const PLACEHOLDER_MOTIVO_FILA_DISPUTADA =
  "Ex.: cliente do PED-2189 tem evento no dia 12; o PED-2059 pode esperar a reposição";

export function placeholderMotivoEstoque(veredito: string | null | undefined): string {
  return veredito === "fila_disputada"
    ? PLACEHOLDER_MOTIVO_FILA_DISPUTADA
    : PLACEHOLDER_MOTIVO_FALTA_REAL;
}
