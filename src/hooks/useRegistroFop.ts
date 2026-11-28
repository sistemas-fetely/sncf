import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { emBlocos, lerResultadoFop, pendentesDeFop, type ItemFop, type ResultadoFopItem } from '@/lib/acervo/registroFop';

/** Payload do passo 6 a partir de sncf_produtos (fase registrado). */
export async function itensFop(cods: string[] | null): Promise<ItemFop[]> {
  const { data, error } = await supabase.rpc('fn_produtos_itens_fop', { p_cods: cods });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ItemFop[];
}

/** Envia ao FOP pelo mesmo caminho da Importação de PI. dry_run=true só consulta. */
export async function registrarNoFop(itens: ItemFop[], dryRun: boolean, onParcial?: (r: ResultadoFopItem[]) => void): Promise<ResultadoFopItem[]> {
  const acumulado: ResultadoFopItem[] = [];
  for (const bloco of emBlocos(itens)) {
    const cods = bloco.map((i) => i.cod_cadastro);
    const { data, error } = await supabase.functions.invoke('promover-fase-produto', { body: { tipo: 'registrar_pi', itens: bloco, dry_run: dryRun } });
    if (error) {
      let msg = error.message;
      try { const ctx = (error as { context?: Response }).context; if (ctx) { const j = await ctx.json(); msg = j?.erro || j?.error || msg; } } catch { /* mantém msg */ }
      acumulado.push(...cods.map((c) => ({ cod_cadastro: c, situacao: 'falhou' as const, motivo: `Falha ao falar com o FOP: ${msg}` })));
      onParcial?.([...acumulado]);
      continue;
    }
    const res = (data as { resultado?: { itens?: unknown[] } } | null)?.resultado;
    acumulado.push(...lerResultadoFop(cods, res?.itens ?? []));
    onParcial?.([...acumulado]);
  }
  return acumulado;
}

/** Produtos nascidos (fase registrado) que o FOP ainda não tem — consulta real ao FOP (prévia, nada gravado). */
export function usePendentesFop() {
  return useQuery({
    queryKey: ['fop-pendentes-registro'],
    meta: { pesada: true },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const itens = await itensFop(null);
      const r = await registrarNoFop(itens, true);
      const pend = pendentesDeFop(r);
      const porCod = new Map(itens.map((i) => [i.cod_cadastro, i]));
      return pend.map((p) => ({ ...p, item: porCod.get(p.cod_cadastro)! }));
    },
  });
}
