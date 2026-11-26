import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { lerResultadoMovimento, type RpcsMovimentoMesa } from "./moverMesa";

const clienteMesa = supabase as unknown as SupabaseClient;

export function useTransicoesMesaSp(pedidoId: string | null) {
  return useQuery({
    queryKey: ["mesa-sp", "transicoes", pedidoId],
    enabled: !!pedidoId,
    staleTime: 10_000,
    queryFn: async (): Promise<RpcsMovimentoMesa["fn_mesa_sp_transicoes"]["Returns"]> => {
      if (!pedidoId) return [];
      const { data, error } = await clienteMesa.rpc("fn_mesa_sp_transicoes", { p_pedido_id: pedidoId });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMoverMesaSp(mensagem = "Pedido movido na Mesa SP.") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RpcsMovimentoMesa["fn_mesa_sp_mover"]["Args"]) => {
      const { data, error } = await clienteMesa.rpc("fn_mesa_sp_mover", args);
      if (error) throw error;
      return lerResultadoMovimento(data);
    },
    onSuccess: async (r, args) => {
      if (!r.ok) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mesa-sp"] }),
        invalidarPedido(qc, args.p_pedido_id),
      ]);
      toast.success(mensagem);
      for (const aviso of r.avisos) toast.info(aviso);
    },
    onError: (error) => toast.error(formatError(error), { duration: Infinity, closeButton: true }),
  });
}