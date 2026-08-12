import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { rawMessage } from "@/lib/format-error";

export interface AlterarNaturezaResultado {
  ok: boolean;
  natureza_de: string | null;
  natureza_para: string | null;
  natureza_nome: string | null;
  gera_titulo: boolean | null;
  entra_receita: boolean | null;
  precificacao: string | null;
  exige_portao: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alerta: any;
}

interface Vars {
  pedidoId: string;
  naturezaCodigo: string;
  motivo: string;
}

/**
 * Troca a natureza de operação do pedido. O banco é a autoridade: valida estágio,
 * papel, título e remessa e levanta exceção. Erro vai CRU pro toast.
 */
export function useAlterarNaturezaPedido() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ pedidoId, naturezaCodigo, motivo }: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("alterar_natureza_pedido", {
        p_pedido_id: pedidoId,
        p_natureza_codigo: naturezaCodigo,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data as AlterarNaturezaResultado;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-eventos", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      toast.success(
        `Natureza alterada para ${data?.natureza_nome ?? vars.naturezaCodigo}`,
        {
          description: data?.gera_titulo
            ? "Este pedido gera título a receber."
            : "Este pedido não gera cobrança.",
        },
      );
    },
    onError: (e: unknown) => {
      toast.error(rawMessage(e));
    },
  });
}
