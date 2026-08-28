import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

/**
 * Envio MANUAL de NF a XPM: chama `empurrar-nf-xpm` com `fila_id`.
 * FAIL-LOUD: erro de rede ou `ok: false` vira toast destrutivo.
 */
export function useEnviarNfXpm(pedido_id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fila_id: string) => {
      const { data, error } = await supabase.functions.invoke("empurrar-nf-xpm", {
        body: { fila_id },
      });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as any;
      if (!res?.ok) throw new Error(res?.erro ?? "A XPM recusou o envio da NF.");
      return res;
    },
    onSuccess: (res) => {
      if (Number(res?.enviados ?? 0) > 0) {
        toast({ title: "NF enviada à XPM", description: "A nota foi atribuída à expedição." });
      } else {
        toast({
          variant: "destructive",
          title: "NF não foi aceita",
          description: `Bloqueados: ${res?.bloqueados ?? 0} · falhas: ${res?.falhas ?? 0}. Veja o erro na trilha de envios.`,
        });
      }
      invalidarPedido(qc, pedido_id);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Falha ao enviar NF à XPM", description: e.message });
      invalidarPedido(qc, pedido_id);
    },
  });
}
