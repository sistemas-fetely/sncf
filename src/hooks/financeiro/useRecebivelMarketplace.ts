import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodos } from '@/lib/supabaseLotes';
import type { RecebivelMarketplace, RecebivelMarketplacePedido } from '@/lib/financeiro/recebivelMarketplace';

// Hosted read models; keep the generated client/types untouched.
const db = supabase as any;
export function useRecebiveisMarketplace() {
  return useQuery({ queryKey: ['recebiveis-marketplace'], queryFn: () => buscarTodos<RecebivelMarketplace>(
    () => db.from('vw_recebivel_marketplace').select('*'), ['venda_id'], 500,
  ) });
}
export function useRecebiveisMarketplacePedidos(ids: string[]) {
  const ordenados = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['marketplace', 'recebiveis-pagina', ordenados], enabled: ordenados.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from('vw_recebivel_marketplace_pedido').select('*').in('pedido_id', ordenados);
      if (error) throw error;
      return new Map<string, RecebivelMarketplacePedido>((data ?? []).map((r: RecebivelMarketplacePedido) => [r.pedido_id, r]));
    },
  });
}