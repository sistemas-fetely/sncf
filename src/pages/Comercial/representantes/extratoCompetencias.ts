/**
 * Competências do extrato de um representante.
 * Competência fechada → o documento lê o detalhe congelado em comissao_extrato.
 * Competência corrente → leitura ao vivo, marcada como prévia.
 */
import { supabase } from "@/integrations/supabase/client";
import { hojeISO } from "@/lib/data";

export interface ExtratoFechadoDoRepresentante {
  id: string;
  competencia: string;
  valor_total: number;
  fechado_em: string | null;
  pagar_ate: string | null;
  detalhe: Record<string, any>[] | null;
}

export async function lerExtratosDoRepresentante(vendedorId: string): Promise<ExtratoFechadoDoRepresentante[]> {
  const { data, error } = await (supabase as any)
    .from("comissao_extrato")
    .select("id,competencia,valor_total,fechado_em,pagar_ate,detalhe")
    .eq("vendedor_id", vendedorId)
    .order("competencia", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtratoFechadoDoRepresentante[];
}

/** Competências existentes (AAAA-MM) mais a corrente, da mais recente para a mais antiga. */
export function opcoesCompetencia(extratos: ExtratoFechadoDoRepresentante[]): string[] {
  const corrente = hojeISO().slice(0, 7);
  const set = new Set<string>([corrente]);
  for (const e of extratos) {
    const c = String(e.competencia ?? "").slice(0, 7);
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function extratoDaCompetencia(
  extratos: ExtratoFechadoDoRepresentante[],
  competencia: string,
): ExtratoFechadoDoRepresentante | undefined {
  return extratos.find((e) => String(e.competencia ?? "").slice(0, 7) === competencia);
}

/** Competência de pagamento AAAA-MM fecha no dia 1 do próprio mês. Fonte única da regra. */
function fechamentoISO(competencia: string): string {
  return `${competencia.slice(0, 7)}-01`;
}

/** "01/MM" do próprio mês da competência. */
export function dataDoFechamento(competencia: string): string {
  return `01/${fechamentoISO(competencia).slice(5, 7)}`;
}

export function competenciaFechada(competencia: string, hoje = hojeISO()): boolean {
  return hoje.slice(0, 10) >= fechamentoISO(competencia);
}
