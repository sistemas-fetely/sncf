import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ItemEdit } from "@/lib/compras/types";

export interface AtualizarPedidoInput {
  pedido_id: string;
  cabecalho: {
    centro_custo_id?: string | null;
    linha_investimento_id?: string | null;
    parceiro_preferencial_id?: string | null;
    descricao_geral?: string | null;
    justificativa?: string | null;
    solicitante_externo?: string | null;
  };
  itens: ItemEdit[];
  anexos_a_remover?: { id: string; storage_path: string }[];
}

export function useAtualizarPedidoCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedido_id, cabecalho, itens, anexos_a_remover }: AtualizarPedidoInput) => {
      // 1. UPDATE cabeçalho
      const { error: errH } = await supabase
        .from("pedidos_compra")
        .update(cabecalho)
        .eq("id", pedido_id);
      if (errH) throw errH;

      // 2. DELETE itens removidos
      const toDelete = itens.filter((i) => i._action === "delete" && i.id).map((i) => i.id!);
      if (toDelete.length) {
        const { error } = await supabase
          .from("pedidos_compra_itens")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      // 3. UPDATE itens existentes
      const toUpdate = itens.filter((i) => i._action === "update" && i.id);
      for (const it of toUpdate) {
        const { error } = await supabase
          .from("pedidos_compra_itens")
          .update({
            descricao: it.descricao,
            quantidade: it.quantidade,
            valor_estimado_unitario: it.valor_estimado_unitario,
            urls: it.urls,
            especificacao_tecnica: it.especificacao_tecnica || null,
            ordem: it.ordem,
          })
          .eq("id", it.id!);
        if (error) throw error;
      }

      // 4. INSERT itens novos
      const toInsert = itens.filter((i) => i._action === "create");
      if (toInsert.length) {
        const { error } = await supabase.from("pedidos_compra_itens").insert(
          toInsert.map((it) => ({
            pedido_id,
            descricao: it.descricao,
            quantidade: it.quantidade,
            valor_estimado_unitario: it.valor_estimado_unitario,
            urls: it.urls,
            especificacao_tecnica: it.especificacao_tecnica || null,
            ordem: it.ordem,
          })),
        );
        if (error) throw error;
      }

      // 5. DELETE anexos marcados
      if (anexos_a_remover?.length) {
        const paths = anexos_a_remover.map((a) => a.storage_path);
        await supabase.storage.from("pedidos-compra-anexos").remove(paths);
        const { error } = await supabase
          .from("pedidos_compra_anexos")
          .delete()
          .in(
            "id",
            anexos_a_remover.map((a) => a.id),
          );
        if (error) throw error;
      }

      return { pedido_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar pedido"),
  });
}
