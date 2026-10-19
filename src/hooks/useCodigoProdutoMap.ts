import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

export interface CodigoProdutoResolvido {
  cod: string | null;
  sku: string | null;
  cadastrado: boolean;
}

interface Par { cod: string; sku: string }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Monta o índice sku/cod → par. Puro e testável. */
export function montarIndiceCodigo(linhas: { cod_cadastro: string | null; sku: string | null }[]): Map<string, Par> {
  const m = new Map<string, Par>();
  for (const l of linhas) {
    if (!l.cod_cadastro || !l.sku) continue;
    const par = { cod: l.cod_cadastro, sku: l.sku };
    m.set(norm(l.sku), par);
    m.set(norm(l.cod_cadastro), par);
  }
  return m;
}

export function resolverCodigo(indice: Map<string, Par> | undefined, chave: string | null | undefined): CodigoProdutoResolvido {
  const k = norm(chave);
  const par = k ? indice?.get(k) : undefined;
  if (par) return { cod: par.cod, sku: par.sku, cadastrado: true };
  return { cod: null, sku: chave?.trim() || null, cadastrado: false };
}

/** Mapa sku ↔ cod_cadastro de sncf_produtos (identificador principal = cod_cadastro). */
export function useCodigoProdutoMap() {
  const q = useQuery({
    queryKey: ["codigo-produto-map"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const linhas: { cod_cadastro: string | null; sku: string | null }[] = [];
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await supabase
          .from("sncf_produtos")
          .select("cod_cadastro, sku")
          .order("sku")
          .range(de, de + passo - 1);
        if (error) throw error;
        linhas.push(...((data ?? []) as typeof linhas));
        if (!data || data.length < passo) break;
      }
      return montarIndiceCodigo(linhas);
    },
  });

  useEffect(() => {
    if (q.isError) toast.error(`Falha ao carregar códigos de produto: ${formatError(q.error)}`);
  }, [q.isError, q.error]);

  const resolver = useCallback((chave: string | null | undefined) => resolverCodigo(q.data, chave), [q.data]);

  return { resolver, isLoading: q.isLoading, isError: q.isError };
}
