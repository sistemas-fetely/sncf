import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PedidoCompraFull } from "@/lib/compras/types";

export function useMeusPedidosCompra() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compras", "meus-pedidos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select(`
          *,
          centros_custo:centro_custo_id (id, codigo, nome),
          linhas_investimento:linha_investimento_id (id, descricao),
          parceiros_comerciais:parceiro_preferencial_id (id, nome_fantasia, razao_social),
          pedidos_compra_itens (id, pedido_id, descricao, quantidade, valor_estimado_unitario, urls, especificacao_tecnica, status, cancelamento_motivo, ordem, unidade_id, created_at),
          pedidos_compra_anexos (id, pedido_id, tipo, nome_original, mime_type, tamanho_bytes, storage_path, uploaded_by, uploaded_at)
        `)
        .eq("solicitante_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PedidoCompraFull[];
    },
  });
}
