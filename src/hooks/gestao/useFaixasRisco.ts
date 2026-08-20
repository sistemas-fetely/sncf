import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Faixas de severidade vêm de gestao_risco_faixa. Nenhum limite (1-2, 3-4…) nem
 * rótulo é escrito no front. A tabela guarda o NOME da cor; aqui só traduzimos
 * esse nome para token visual do SNCF.
 */

export interface FaixaRisco {
  id: string;
  minimo: number;
  maximo: number;
  rotulo: string;
  cor: string;
  ordem: number | null;
}

const CLASSES_POR_COR: Record<string, string> = {
  verde: "bg-success/15 text-success border-success/40",
  amarelo: "bg-warning/15 text-warning border-warning/40",
  laranja: "bg-warning/25 text-warning border-warning/60",
  vermelho: "bg-destructive/15 text-destructive border-destructive/40",
};

export function classesDaFaixa(faixa: FaixaRisco | null | undefined): string {
  if (!faixa) return "bg-muted text-muted-foreground border-border";
  return CLASSES_POR_COR[faixa.cor] ?? "bg-muted text-muted-foreground border-border";
}

export function useFaixasRisco() {
  return useQuery({
    queryKey: ["gestao", "risco-faixas"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FaixaRisco[]> => {
      const { data, error } = await supabase
        .from("gestao_risco_faixa")
        .select("id,minimo,maximo,rotulo,cor,ordem")
        .order("minimo");
      if (error) throw error;
      return (data ?? []) as FaixaRisco[];
    },
  });
}

/** Resolve a faixa de uma severidade. Fora de faixa devolve null — e o front mostra "—". */
export function faixaDe(faixas: FaixaRisco[] | undefined, severidade: number | null | undefined) {
  if (severidade == null) return null;
  return faixas?.find((f) => severidade >= f.minimo && severidade <= f.maximo) ?? null;
}
