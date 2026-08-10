/**
 * Metadados de apresentação do motor de auditoria "regra como dado".
 * Fonte de verdade dos códigos é o banco (auditoria_severidade_dim,
 * auditoria_situacao_dim). Aqui só vive a tradução para tokens visuais.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Achado = Tables<"vw_auditoria_achado">;
export type RegraPainel = Tables<"vw_auditoria_painel">;
export type Regra = Tables<"auditoria_regra">;
export type Execucao = Tables<"auditoria_execucao">;

export const SEVERIDADE_CLS: Record<string, string> = {
  bloqueante: "bg-destructive/10 text-destructive border-destructive/30",
  atencao: "bg-warning/15 text-warning-foreground border-warning/40",
  informativo: "bg-muted text-muted-foreground border-border",
};

export const SEVERIDADE_DOT: Record<string, string> = {
  bloqueante: "bg-destructive",
  atencao: "bg-warning",
  informativo: "bg-muted-foreground/50",
};

export const SITUACAO_CLS: Record<string, string> = {
  aberto: "bg-muted text-foreground border-border",
  em_analise: "bg-info/10 text-info border-info/30",
  resolvido: "bg-success/10 text-success border-success/30",
  explicado: "bg-success/10 text-success border-success/30",
  reaparecido: "bg-destructive/10 text-destructive border-destructive/30",
};

export type Saude = "ok" | "inativa" | "com_erro" | "nunca_rodou" | "parada";

export const SAUDE_META: Record<
  Saude,
  { label: string; cls: string; ajuda: string; grita: boolean }
> = {
  ok: {
    label: "OK",
    cls: "bg-success/10 text-success border-success/30",
    ajuda: "Rodou recentemente, sem erro.",
    grita: false,
  },
  parada: {
    label: "PARADA",
    cls: "bg-destructive text-destructive-foreground border-destructive",
    ajuda: "Não roda há mais de 3 dias. Painel morto não avisa ninguém.",
    grita: true,
  },
  com_erro: {
    label: "Com erro",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    ajuda: "A última execução falhou.",
    grita: true,
  },
  nunca_rodou: {
    label: "Nunca rodou",
    cls: "bg-warning/15 text-warning-foreground border-warning/40",
    ajuda: "A regra existe mas nunca foi executada.",
    grita: false,
  },
  inativa: {
    label: "Inativa",
    cls: "bg-muted text-muted-foreground border-border",
    ajuda: "Regra desligada — não entra nas rodadas.",
    grita: false,
  },
};

export function saudeMeta(saude: string | null) {
  return SAUDE_META[(saude ?? "nunca_rodou") as Saude] ?? SAUDE_META.nunca_rodou;
}

export const AJUDA_CONTRATO_SQL = {
  achado: [
    "`chave` (obrigatória) — identidade estável do achado. Mudar a chave cria achado novo.",
    "`detalhe` (obrigatória) — a evidência em uma frase.",
    "Opcionais: `id_externo`, `entidade`, `entidade_id`, `pedido_id`, `parceiro`, `valor`, `contexto` (jsonb).",
  ],
  contagem: ["O SELECT devolve uma linha e uma coluna numérica."],
} as const;

export function formatDataHora(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function diasDesde(v: string | null | undefined): number | null {
  if (!v) return null;
  return Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
}
