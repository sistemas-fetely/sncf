import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePedidoEmailLog(pedido_id: string) {
  return useQuery({
    queryKey: ["pedido-email-log", pedido_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_email_log")
        .select("id, tipo_email, destinatario, cc, enviado_em, estagio_pedido")
        .eq("pedido_id", pedido_id)
        .order("enviado_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!pedido_id,
  });
}

export function useLogEmailEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      pedido_id: string;
      tipo_email: string;
      destinatario: string;
      cc?: string[];
      estagio_pedido?: string;
      titulo_id?: string;
    }) => {
      const { error } = await (supabase as any)
        .from("pedido_email_log")
        .insert({
          pedido_id: args.pedido_id,
          tipo_email: args.tipo_email,
          destinatario: args.destinatario,
          cc: args.cc ?? null,
          estagio_pedido: args.estagio_pedido ?? null,
          titulo_id: args.titulo_id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-email-log", vars.pedido_id] });
    },
  });
}
