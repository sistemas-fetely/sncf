import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Linha = Record<string, any>;

/** Lê uma view inteira em páginas de 1000. FAIL-LOUD: lança o erro real do banco. */
export async function lerTudo(
  view: string,
  filtro?: (q: any) => any,
  ordem?: { col: string; asc?: boolean },
  colunas = "*",
): Promise<Linha[]> {
  const TAM = 1000;
  const out: Linha[] = [];
  for (let off = 0; ; off += TAM) {
    let q: any = (supabase as any).from(view).select(colunas);
    if (filtro) q = filtro(q);
    if (ordem) q = q.order(ordem.col, { ascending: ordem.asc ?? true });
    const { data, error } = await q.range(off, off + TAM - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < TAM) break;
  }
  return out;
}

export function fmtPct2(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function fmtInt(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR");
}

export const SITUACAO: Record<string, { label: string; cls: string }> = {
  liberada: { label: "Liberada", cls: "bg-success/15 text-success border-success/30" },
  paga_aguarda_liberacao: { label: "Paga, aguarda liberação", cls: "bg-info/15 text-info border-info/30" },
  vencida: { label: "Vencida", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  a_vencer: { label: "A vencer", cls: "bg-muted text-muted-foreground border-border" },
};

export const TOOLTIP_SEM_CONTRAPARTE =
  "Representante não tem cadastro em parceiros_comerciais. Sem isso o sistema não consegue gerar o título a pagar da comissão.";
