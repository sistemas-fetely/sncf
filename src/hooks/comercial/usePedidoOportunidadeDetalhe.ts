import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PedidoItemOportunidade {
  id: string;
  sku: string | null;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  subtotal: number | null;
  ordem: number | null;
}

export interface ObsComercial {
  id: string;
  descricao: string | null;
  criado_em: string | null;
}

/** Itens do pedido (aba "Itens" do dialog de oportunidade). */
export function useItensPedidoOportunidade(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["oportunidade-itens", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<PedidoItemOportunidade[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_itens")
        .select("id, sku, descricao, quantidade, valor_unitario, subtotal, ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoItemOportunidade[];
    },
  });
}

/** Observações comerciais do pedido (pedido_eventos, tipo_evento = 'msg_comercial'). */
export function useObsComerciaisPedido(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["oportunidade-obs-comerciais", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<ObsComercial[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_eventos")
        .select("id, descricao, criado_em")
        .eq("pedido_id", pedidoId)
        .eq("tipo_evento", "msg_comercial")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ObsComercial[];
    },
  });
}

/**
 * Grava observação comercial. FAIL-LOUD: erro sobe e vira toast destrutivo.
 * 'msg_comercial' é validado no CHECK da tabela — não trocar o valor.
 */
export function useAdicionarObsComercial(pedidoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) => {
      if (!pedidoId) throw new Error("pedido_id obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_evento_pedido", {
        p_pedido_id: pedidoId,
        p_tipo_evento: "msg_comercial",
        p_descricao: texto.trim(),
        p_metadata: { origem: "oportunidades" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Observação registrada");
      qc.invalidateQueries({ queryKey: ["oportunidade-obs-comerciais", pedidoId] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível registrar a observação");
    },
  });
}
