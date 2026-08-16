/**
 * Bolinhas de Qualidade do Dado (Fase 1 — 29/04/2026).
 *
 * Doutrina cravada por Flavio em 28/04 (Cereja do Bolo).
 *
 * Backend: função RPC qualidade_dado_contas(uuid[]) → (nivel, motivos[])
 * Helper: traduz nivel + motivos em ícone + cor + tooltip humano.
 */

import { Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type QualidadeNivel = "vermelho" | "amarelo" | "verde";

export type QualidadeMotivo =
  | "sem_categoria"
  | "sem_nf_documento"
  | "duplicado_provavel"
  | "categoria_divergente" // Fase 2 (futuro)
  | "valor_atipico"; // Fase 2 (futuro)

export interface QualidadeDado {
  conta_id: string;
  nivel: QualidadeNivel;
  motivos: QualidadeMotivo[] | null;
}

export interface QualidadeDadoVisual {
  Icon: LucideIcon;
  cor: string;
  bg: string;
  label: string;
  tooltip: string;
}

const MOTIVO_LABELS: Record<QualidadeMotivo, string> = {
  sem_categoria: "Sem categoria",
  sem_nf_documento: "Sem NF nem documento anexado",
  duplicado_provavel: "Duplicado provável (mesma data+valor+parceiro)",
  categoria_divergente: "Categoria divergente do histórico",
  valor_atipico: "Valor atípico para o parceiro/categoria",
};

/**
 * Devolve ícone + cor + tooltip com base no nível e motivos.
 * Verde NÃO retorna ícone (sem sinal = saúde OK, evita poluir tabela).
 */
export function getQualidadeDadoIcon(
  nivel: QualidadeNivel | null | undefined,
  motivos: QualidadeMotivo[] | null | undefined,
): QualidadeDadoVisual | null {
  if (!nivel || nivel === "verde") return null;

  const motivosTexto = (motivos || [])
    .map((m) => MOTIVO_LABELS[m] || m)
    .join(" · ");

  if (nivel === "vermelho") {
    return {
      Icon: Circle,
      cor: "text-destructive",
      bg: "fill-destructive",
      label: "Atenção",
      tooltip: motivosTexto || "Atenção: dado incompleto",
    };
  }

  // amarelo
  return {
    Icon: Circle,
    cor: "text-warning",
    bg: "fill-warning",
    label: "Verificar",
    tooltip: motivosTexto || "Verificar: anomalia detectada",
  };
}

/**
 * Indexa lista de QualidadeDado por conta_id pra lookup O(1) na tabela.
 */
export function indexQualidadePorConta(
  lista: QualidadeDado[] | null | undefined,
): Map<string, QualidadeDado> {
  const map = new Map<string, QualidadeDado>();
  for (const item of lista || []) {
    map.set(item.conta_id, item);
  }
  return map;
}
