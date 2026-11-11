import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { nomeExibicao } from '@/lib/parceiros/nome';
import { exigirSucesso } from './regras';

// These read models/RPCs are already hosted; do not hand-edit generated types.
const db = supabase as any;
export type Transporte = { id: string; transportadora: string; valor: number | null; origem: string; referencia: string | null; data: string | null };
export type PedidoMarketplace = {
  pedido_id: string; id_externo: string; marketplace_codigo: string; marketplace_nome: string;
  numero_marketplace: string | null; cliente_nome: string | null; cidade: string | null; uf: string | null;
  valor_liquido: number | null; estagio: string | null; cd_codigo: string | null; nf_numero: string | null;
  rastreio_codigo: string | null; transportadora_id: string | null; transportadora_nome: string | null;
  custo_transporte: number | null; comissao_marketplace: number | null; frete_marketplace: number | null;
  transportes: Transporte[] | null;
  bling_numero: string | null; data_pedido: string | null; estagio_rotulo: string | null; estagio_ordem: number;
  area_responsavel: string | null; proxima_acao: string | null; eh_final: boolean; cd_nome: string | null;
  subetapa: string | null; horas_no_estagio: number | null; alerta: string | null; faturado_em: string | null;
  xpm_expedicao_codigo: string | null; servico_marketplace: string | null; rastreio_status: string | null;
  devolucao_numero: string | null; devolucao_status: string | null; cancelado_em: string | null;
  entregue_em: string | null; liquido_estimado: number | null;
};
export type Portador = { id: string; nome: string };
export type Loja = { codigo: string; nome: string; centro_codigo: string | null; parceiro_id: string | null; portador_nome: string | null };
export type Estagio = { codigo: string; rotulo: string; ordem: number; eh_final: boolean };

async function lerTudo<T>(tabela: string, colunas = '*', ordenar = 'pedido_id'): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await db.from(tabela).select(colunas).order(ordenar).range(inicio, inicio + 499);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if ((data ?? []).length < 500) return linhas;
  }
}

export function useMarketplace() {
  return useQuery({ queryKey: ['marketplace', 'pedidos'], queryFn: () => lerTudo<PedidoMarketplace>('vw_gestao_marketplace', '*', 'pedido_id') });
}
export function useCadastroMarketplace() {
  return useQuery({ queryKey: ['marketplace', 'cadastros'], queryFn: async () => {
    const [lojas, padroes, perfis, parceiros, estagios] = await Promise.all([
      lerTudo<any>('marketplace_loja', 'codigo,nome,centro_codigo', 'codigo'),
      lerTudo<any>('marketplace_transportadora_padrao', 'marketplace_codigo,parceiro_id', 'marketplace_codigo'),
      db.from('transportadora_perfil').select('transportadora_id').eq('ativo', true),
      lerTudo<any>('parceiros_comerciais', 'id,razao_social,nome_fantasia', 'id'),
      db.from('marketplace_estagio').select('codigo,rotulo,ordem,eh_final').order('ordem'),
    ]);
    if (perfis.error) throw perfis.error;
    if (estagios.error) throw estagios.error;
    const ids = new Set((perfis.data ?? []).map((p: { transportadora_id: string }) => p.transportadora_id));
    const nomes = new Map<string, string>(parceiros.map(p => [p.id, nomeExibicao(p.razao_social, p.nome_fantasia)]));
    const portadores: Portador[] = parceiros.filter(p => ids.has(p.id)).map(p => ({ id: p.id, nome: nomes.get(p.id) ?? p.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { portadores, estagios: (estagios.data ?? []) as Estagio[], lojas: lojas.map(l => {
      const parceiro_id = padroes.find(p => p.marketplace_codigo === l.codigo)?.parceiro_id ?? null;
      return { ...l, parceiro_id, portador_nome: parceiro_id ? nomes.get(parceiro_id) ?? parceiro_id : null } as Loja;
    }) };
  } });
}
export function useRegistrarTransporte() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (args: { p_pedido_id: string; p_parceiro_id: string; p_valor: number | null; p_referencia: string; p_data_servico: string; p_observacao: string }) => {
    const { data, error } = await db.rpc('fn_pedido_transporte_registrar', { ...args, p_origem: 'manual' });
    if (error) throw error;
    exigirSucesso(data);
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['marketplace'] }); } });
}
export function usePortadorPadrao() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (args: { p_marketplace_codigo: string; p_parceiro_id: string | null; p_observacao: string }) => {
    const { data, error } = await db.rpc('fn_marketplace_transportadora_padrao_set', args);
    if (error) throw error;
    exigirSucesso(data);
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['marketplace'] }); } });
}