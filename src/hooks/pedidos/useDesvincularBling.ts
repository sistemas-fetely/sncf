import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Vars {
  pedido_id: string;
  motivo: string;
  confirmado_no_bling: boolean;
}

interface Resultado {
  ok: boolean;
  erro?: string | null;
  id_externo?: string | null;
  bling_id_desvinculado?: string | number | null;
  remessas_canceladas?: number | null;
  confirmado_no_bling?: boolean | null;
  aviso?: string | null;
}

/**
 * Desfaz o vínculo do pedido com o Bling (super_admin only).
 * FAIL-LOUD: a RPC devolve erro dentro do jsonb, não lança — checamos os dois.
 */
export function useDesvincularBling() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: Vars): Promise<Resultado> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("desvincular_envio_bling", {
        p_pedido_id: vars.pedido_id,
        p_motivo: vars.motivo,
        p_confirmado_no_bling: vars.confirmado_no_bling,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as Resultado;
      if (res.ok === false) throw new Error(res.erro || "Não foi possível desvincular do Bling.");
      return res;
    },
    onSuccess: (res, vars) => {
      const partes: string[] = [];
      if (res.bling_id_desvinculado != null) partes.push(`Bling #${res.bling_id_desvinculado} desvinculado`);
      partes.push(`${res.remessas_canceladas ?? 0} remessa(s) cancelada(s)`);
      toast({
        title: `${res.id_externo ?? "Pedido"} desvinculado do Bling`,
        description: partes.join(" · "),
      });
      if (res.aviso) {
        toast({ title: "Atenção", description: res.aviso });
      }
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["remessas", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-vinculos"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => {
      toast({
        title: "Não foi possível desvincular do Bling",
        description: e?.message ?? "Erro desconhecido",
        variant: "destructive",
      });
    },
  });
}
