import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useMarcarAtencao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedidoId,
      nivel,
      motivo,
    }: {
      pedidoId: string;
      nivel: 'pausa' | 'aviso';
      motivo: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('marcar_atencao_pedido', {
        p_pedido_id: pedidoId,
        p_nivel: nivel,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pedidoId, nivel }) => {
      qc.invalidateQueries({ queryKey: ['pedido', pedidoId] });
      qc.invalidateQueries({ queryKey: ['pedido-detalhe', pedidoId] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      toast({
        title: nivel === 'pausa' ? 'Pedido pausado' : 'Aviso registrado',
        description:
          nivel === 'pausa'
            ? 'Nenhum avanço automático ou manual será permitido enquanto a pausa estiver ativa.'
            : 'Aviso visível no cabeçalho do pedido.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useLimparAtencao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedidoId,
      motivoRemocao,
    }: {
      pedidoId: string;
      motivoRemocao?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('limpar_atencao_pedido', {
        p_pedido_id: pedidoId,
        p_motivo_remocao: motivoRemocao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pedidoId }) => {
      qc.invalidateQueries({ queryKey: ['pedido', pedidoId] });
      qc.invalidateQueries({ queryKey: ['pedido-detalhe', pedidoId] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      toast({ title: 'Atenção removida', description: 'Pedido liberado para avançar.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
