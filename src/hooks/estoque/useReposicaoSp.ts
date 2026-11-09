import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LinhaReposicaoTabela } from "@/lib/estoque/reposicaoSpTabela";

export function useReposicaoSp() {
  return useQuery({ queryKey: ["reposicao-sp"], queryFn: async () => {
    const out: LinhaReposicaoTabela[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("vw_reposicao_sp").select("*").order("sku").range(de, de + 999);
      if (error) throw error;
      const linhas = (data ?? []).filter((l): l is typeof l & { sku: string } => !!l.sku);
      for (let i = 0; i < linhas.length; i += 200) {
        const bloco = linhas.slice(i, i + 200);
        const codigos = [...new Set(bloco.flatMap(l => l.cod_cadastro ? [l.cod_cadastro] : []))];
        const { data: produtos, error: erroPeso } = codigos.length
          ? await supabase.from("sncf_produtos").select("cod_cadastro,peso_g,colecao,familia,grupo").in("cod_cadastro", codigos)
          : { data: [], error: null };
        if (erroPeso) throw erroPeso;
        const cadastro = new Map((produtos ?? []).map(p => [p.cod_cadastro, p]));
        out.push(...bloco.map(l => { const p = cadastro.get(l.cod_cadastro); return { ...l, peso_g: p?.peso_g ?? null, colecao: p?.colecao ?? null, familia: p?.familia ?? null, grupo: p?.grupo ?? null }; }));
      }
      if (!data || data.length < 1000) break;
    }
    return out;
  } });
}