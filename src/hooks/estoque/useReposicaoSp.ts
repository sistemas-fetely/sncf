import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReposicaoSp } from "@/lib/estoque/reposicaoSp";

export function useReposicaoSp() {
  return useQuery({ queryKey: ["reposicao-sp"], queryFn: async () => {
    const out: ReposicaoSp[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("vw_reposicao_sp").select("*").order("sku").range(de, de + 999);
      if (error) throw error;
      const linhas = (data ?? []).filter((l): l is typeof l & { sku: string } => !!l.sku);
      for (let i = 0; i < linhas.length; i += 200) {
        const bloco = linhas.slice(i, i + 200);
        const { data: produtos, error: erroPeso } = await supabase.from("sncf_produtos").select("sku,peso_g").in("sku", bloco.map(l => l.sku));
        if (erroPeso) throw erroPeso;
        const pesos = new Map((produtos ?? []).map(p => [p.sku, p.peso_g]));
        out.push(...bloco.map(l => ({ ...l, peso_g: pesos.get(l.sku) ?? null })));
      }
      if (!data || data.length < 1000) break;
    }
    return out;
  } });
}