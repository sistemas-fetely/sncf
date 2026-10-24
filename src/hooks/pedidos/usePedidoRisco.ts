import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RiscoMotivo {
  codigo: string;
  rotulo: string;
  pontos: number;
}

export interface PedidoRisco {
  pedido_id: string;
  id_externo: string | null;
  estagio: string | null;
  parceiro_razao: string | null;
  valor_liquido: number | null;
  dias_na_fase: number | null;
  risco_score: number | null;
  risco_faixa: string | null;
  risco_cor: string | null;
  risco_motivos: RiscoMotivo[] | null;
}

/** Lê `vw_pedido_risco` e devolve um Map por pedido_id. FAIL-LOUD. */
export function usePedidoRisco() {
  return useQuery({
    queryKey: ["pedido-risco"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, PedidoRisco>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_risco")
        .select(
          "pedido_id, id_externo, estagio, parceiro_razao, valor_liquido, dias_na_fase, risco_score, risco_faixa, risco_cor, risco_motivos",
        );
      if (error) throw error;
      const m = new Map<string, PedidoRisco>();
      ((data || []) as PedidoRisco[]).forEach((r) => {
        m.set(r.pedido_id, {
          ...r,
          risco_score: r.risco_score === null ? null : Number(r.risco_score),
          dias_na_fase: r.dias_na_fase === null ? null : Number(r.dias_na_fase),
          risco_motivos: Array.isArray(r.risco_motivos) ? r.risco_motivos : [],
        });
      });
      return m;
    },
  });
}

export interface RiscoFaixa {
  codigo: string;
  rotulo: string;
  minimo: number;
  cor: string;
  ordem: number;
}

/** Dimensão `pedido_risco_faixa` — origem única de rótulo e cor da faixa. */
export function usePedidoRiscoFaixas() {
  return useQuery({
    queryKey: ["pedido-risco-faixas"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, RiscoFaixa>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_risco_faixa")
        .select("codigo, rotulo, minimo, cor, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      const m = new Map<string, RiscoFaixa>();
      ((data || []) as RiscoFaixa[]).forEach((f) => m.set(f.codigo, f));
      return m;
    },
  });
}

/** Mapeia o nome semântico de cor vindo do banco para o token de design do projeto. */
export const RISCO_COR_TOKEN: Record<string, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  muted: "bg-muted-foreground",
};
