import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

export interface ImagemProdutoFinal {
  imagem_url: string;
  origem: string | null;
  imagem_do_produto: boolean | null;
}

type CampoImagem = "cod_cadastro" | "sku";
type Identificador = string | null | undefined;

function identificadores(valores: Identificador[]): string[] {
  return [...new Set(valores.filter((v): v is string => typeof v === "string" && v.trim() !== ""))].sort();
}

/** Prioridade de fotos pertence exclusivamente à view; não há fallback no front. */
export async function buscarImagensProdutos(
  campo: CampoImagem,
  valores: Identificador[],
): Promise<Map<string, ImagemProdutoFinal>> {
  const chaves = identificadores(valores);
  const mapa = new Map<string, ImagemProdutoFinal>();
  try {
    for (let i = 0; i < chaves.length; i += 300) {
      const { data, error } = await supabase.from("vw_produto_imagem_final")
        .select("sku, cod_cadastro, imagem_url, origem, imagem_do_produto")
        .in(campo, chaves.slice(i, i + 300));
      if (error) throw error;
      for (const linha of data ?? []) {
        const chave = linha[campo];
        if (chave && linha.imagem_url !== null) {
          mapa.set(chave, {
            imagem_url: linha.imagem_url,
            origem: linha.origem,
            imagem_do_produto: linha.imagem_do_produto,
          });
        }
      }
    }
    return mapa;
  } catch (error) {
    throw new Error(formatError(error));
  }
}

function useImagens(campo: CampoImagem, valores: Identificador[]) {
  const chaves = identificadores(valores);
  return useQuery({
    queryKey: ["produto-imagem-final", campo, chaves],
    enabled: chaves.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: () => buscarImagensProdutos(campo, chaves),
  });
}

export function useImagensPorCod(codigos: Identificador[]) {
  return useImagens("cod_cadastro", codigos);
}

export function useImagensPorSku(skus: Identificador[]) {
  return useImagens("sku", skus);
}