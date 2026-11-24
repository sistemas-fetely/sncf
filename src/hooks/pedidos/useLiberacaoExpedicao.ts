import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fonteLiberacao,
  rotuloFontePedido,
} from "@/lib/pedidos/fontePedido";

export interface LiberacaoExpedicao {
  pedido_id: string;
  liberado: boolean;
  codigo: string;
  rotulo: string;
  tom: "ok" | "alerta";
  motivo: string | null;
  nivel_prova: string | null;
  prova_rotulo: string | null;
  prova_tom: "ok" | "alerta" | "perigo" | null;
  prova_frase: string | null;
}

/**
 * Veredito único de liberação de expedição (vw_pedido_liberacao_expedicao).
 * Em lote: uma query só para a fila inteira (nunca uma por linha).
 * `foto: true` lê a foto replicada a cada minuto (usada na LISTA); o padrão é a
 * view viva, que detalhe, diálogo e decisão continuam lendo.
 */
export function useLiberacaoExpedicaoLote(
  pedidoIds: string[],
  opts?: { foto?: boolean },
) {
  const foto = !!opts?.foto;
  const ids = [...pedidoIds].sort();
  return useQuery({
    queryKey: ["liberacao-expedicao-lote", rotuloFontePedido(foto), ids],
    meta: { pesada: true },
    enabled: ids.length > 0,
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<Map<string, LiberacaoExpedicao>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(fonteLiberacao(foto))
        .select(
          "pedido_id, liberado, codigo, rotulo, tom, motivo, nivel_prova, prova_rotulo, prova_tom, prova_frase"
        )
        .in("pedido_id", ids);
      if (error) throw error;
      const m = new Map<string, LiberacaoExpedicao>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((r: any) => {
        m.set(r.pedido_id, r as LiberacaoExpedicao);
      });
      return m;
    },
  });
}

