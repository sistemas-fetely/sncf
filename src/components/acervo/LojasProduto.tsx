// Lojas do produto (produto_loja × loja_dim) — só leitura; a porta de edição é a planilha v2 do catálogo.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type LojaDoProduto = { slug: string; nome: string; vende: boolean };

async function lerLojas(cods: string[]): Promise<Map<string, LojaDoProduto[]>> {
  const dim = await supabase.from("loja_dim").select("slug,nome,ordem").eq("ativo", true).order("ordem");
  if (dim.error) throw dim.error;
  const vende = new Map<string, boolean>();
  for (let i = 0; i < cods.length; i += 150) {
    const r = await supabase.from("produto_loja").select("cod_cadastro,loja,vende").in("cod_cadastro", cods.slice(i, i + 150));
    if (r.error) throw r.error;
    for (const x of r.data ?? []) vende.set(`${x.cod_cadastro}|${x.loja}`, x.vende);
  }
  return new Map(cods.map(c => [c, (dim.data ?? []).map(d => ({ slug: d.slug, nome: d.nome, vende: vende.get(`${c}|${d.slug}`) === true }))]));
}

export function useLojasProdutos(cods: string[]) {
  const chave = [...new Set(cods.filter(Boolean))].sort();
  return useQuery({ queryKey: ["produto-lojas", chave], enabled: chave.length > 0, staleTime: 60_000, queryFn: () => lerLojas(chave) });
}

/** Chips das lojas: as que vendem em destaque; as demais só aparecem com `todas`. */
export function ChipsLojas({ lojas, todas = false }: { lojas?: LojaDoProduto[]; todas?: boolean }) {
  if (!lojas) return <span className="text-muted-foreground">—</span>;
  const lista = todas ? lojas : lojas.filter(l => l.vende);
  if (!lista.length) return <span className="text-muted-foreground">nenhuma loja</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {lista.map(l => (
        <Badge key={l.slug} variant={l.vende ? "secondary" : "outline"} className={cn("py-0 text-[10px] font-normal", !l.vende && "text-muted-foreground line-through")} title={l.vende ? `Vende em ${l.nome}` : `Não vende em ${l.nome}`}>
          {l.nome}
        </Badge>
      ))}
    </span>
  );
}
