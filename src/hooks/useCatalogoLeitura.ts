import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CelulaCatalogo } from '@/lib/acervo/revisaoCatalogo';

/** Shared read-only source for the daily review and its tab badge. */
export function useCatalogoLeitura() {
  const ultima = useQuery({ queryKey: ['catalogo-planilha-ultima'], queryFn: async () => {
    const r = await supabase.from('catalogo_planilha_leitura').select('*').eq('ambiente', 'oficial').order('lida_em', { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error; return r.data;
  } });
  const referencia = useQuery({ queryKey: ['catalogo-planilha-referencia', ultima.data?.id], queryFn: async () => {
    const r = await supabase.from('catalogo_planilha_leitura').select('*').eq('ambiente', 'oficial').in('status', ['comparada', 'aplicada_parcial', 'aplicada']).order('lida_em', { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error; return r.data;
  } });
  const lista = useQuery({ queryKey: ['catalogo-planilha-mudancas', referencia.data?.id], enabled: !!referencia.data?.id, queryFn: async () => {
    const out: CelulaCatalogo[] = [];
    for (let de = 0; ; de += 1000) {
      const r = await supabase.from('catalogo_planilha_mudanca').select('*').eq('leitura_id', referencia.data?.id ?? '').eq('status', 'pendente').order('cod_cadastro').order('campo').range(de, de + 999);
      if (r.error) throw r.error;
      out.push(...(r.data ?? [])); if (!r.data || r.data.length < 1000) break;
    }
    return out;
  } });
  return { ultima, referencia, lista, pendencias: (lista.data ?? []).filter(c => c.dono === 'operacoes').length,
    pronto: ultima.isSuccess && referencia.isSuccess && (!referencia.data || lista.isSuccess),
    erro: ultima.error ?? referencia.error ?? lista.error };
}