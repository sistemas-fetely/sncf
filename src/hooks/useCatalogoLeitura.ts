import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CelulaCatalogo } from '@/lib/acervo/revisaoCatalogo';
import { resolverLeituraConteudo } from '../../supabase/functions/_shared/catalogo-planilha/referencia';
import { lerPropostas, propostasPendentes } from '@/lib/acervo/nascimentoCatalogo';

/** Shared read-only source for the daily review and its tab badge. */
export function useCatalogoLeitura(acompanhando = false) {
  const ultima = useQuery({ queryKey: ['catalogo-planilha-ultima'], refetchInterval: acompanhando ? 3000 : 30_000, queryFn: async () => {
    const r = await supabase.from('catalogo_planilha_leitura').select('*').eq('ambiente', 'oficial').order('lida_em', { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error; return r.data;
  } });
  const referencia = useQuery({ queryKey: ['catalogo-planilha-referencia', ultima.data?.id, ultima.data?.status], enabled: ultima.isSuccess, refetchInterval: acompanhando ? 3000 : 30_000, queryFn: async () => {
    let conteudo = ultima.data;
    if (conteudo && ['sem_mudanca', 'comparada', 'aplicada_parcial', 'aplicada'].includes(conteudo.status)) {
      conteudo = await resolverLeituraConteudo(conteudo, async id => {
        const r = await supabase.from('catalogo_planilha_leitura').select('*').eq('id', id).eq('ambiente', 'oficial').maybeSingle();
        if (r.error) throw r.error;
        return r.data;
      });
    } else {
    const r = await supabase.from('catalogo_planilha_leitura').select('*').eq('ambiente', 'oficial').in('status', ['comparada', 'aplicada_parcial', 'aplicada']).order('lida_em', { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error; conteudo = r.data;
    }
    const propostas = lerPropostas(conteudo?.totais);
    if (!conteudo || !propostas) return conteudo;
    const cods = [...new Set(propostas.nascimentos.map(n => n.cod_cadastro))];
    const eans = [...new Set(propostas.cartorio.map(c => c.ean))];
    const existentes = new Set<string>();
    const cartorio: { ean: string; cod_cadastro: string | null; inner_qtd: number | null }[] = [];
    await Promise.all([
      (async () => { for (let de = 0; de < cods.length; de += 200) {
        const r = await supabase.from('sncf_produtos').select('cod_cadastro').in('cod_cadastro', cods.slice(de, de + 200));
        if (r.error) throw r.error;
        for (const p of r.data ?? []) if (p.cod_cadastro) existentes.add(p.cod_cadastro);
      } })(),
      (async () => { for (let de = 0; de < eans.length; de += 200) {
        const r = await supabase.from('cartorio_codigo').select('ean,cod_cadastro,inner_qtd').in('ean', eans.slice(de, de + 200));
        if (r.error) throw r.error;
        cartorio.push(...(r.data ?? []));
      } })(),
    ]);
    return { ...conteudo, totais: { ...(conteudo.totais as Record<string, never>), propostas: propostasPendentes(propostas, existentes, cartorio) } };
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
  return { ultima, referencia, lista, pendencias: (lista.data ?? []).filter(c => ['operacoes', 'produto'].includes(c.dono) && ['mudanca', 'conflito', 'erro'].includes(c.tipo)).length,
    pronto: ultima.isSuccess && referencia.isSuccess && (!referencia.data || lista.isSuccess),
    erro: ultima.error ?? referencia.error ?? lista.error };
}