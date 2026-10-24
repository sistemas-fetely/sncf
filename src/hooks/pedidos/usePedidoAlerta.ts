import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoAlerta {
  pedido_id: string;
  severidade: string | null;
  severidade_peso: number | null;
  achados: number | null;
  bloqueantes: number | null;
  atencoes: number | null;
  informativos: number | null;
  tem_reincidente: boolean | null;
  desde: string | null;
  idade_dias: number | null;
  titulo_principal: string | null;
  detalhe_principal: string | null;
  regras: string | null;
}

/** Lê `vw_pedido_alerta` e devolve um Map por pedido_id. FAIL-LOUD. */
export function usePedidoAlerta() {
  return useQuery({
    queryKey: ["pedido-alerta"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, PedidoAlerta>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_alerta")
        .select(
          "pedido_id, severidade, severidade_peso, achados, bloqueantes, atencoes, informativos, tem_reincidente, desde, idade_dias, titulo_principal, detalhe_principal, regras",
        );
      if (error) throw error;
      const m = new Map<string, PedidoAlerta>();
      ((data || []) as PedidoAlerta[]).forEach((r) => {
        m.set(r.pedido_id, {
          ...r,
          achados: r.achados === null ? null : Number(r.achados),
          bloqueantes: r.bloqueantes === null ? null : Number(r.bloqueantes),
          atencoes: r.atencoes === null ? null : Number(r.atencoes),
          informativos: r.informativos === null ? null : Number(r.informativos),
          severidade_peso: r.severidade_peso === null ? null : Number(r.severidade_peso),
          idade_dias: r.idade_dias === null ? null : Number(r.idade_dias),
        });
      });
      return m;
    },
  });
}

/** Cor da bolinha de alerta operacional, por severidade. Só tokens. */
export const ALERTA_COR_TOKEN: Record<string, string> = {
  bloqueante: "bg-destructive",
  atencao: "bg-warning",
  informativo: "bg-muted-foreground",
};
