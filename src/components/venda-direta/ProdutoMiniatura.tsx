import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";

export interface ImagemProduto { imagem_url: string | null; imagem_do_produto: boolean }

/** Fotos em lote (uma query .in) a partir de vw_produto_imagem_final. */
export function useImagensProduto(skus: string[]) {
  const chave = Array.from(new Set(skus)).sort();
  const q = useQuery({
    queryKey: ["venda-direta-imagens", chave.join(",")],
    enabled: chave.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, ImagemProduto>> => {
      const { data, error } = await (supabase as any)
        .from("vw_produto_imagem_final")
        .select("sku, imagem_url, imagem_do_produto")
        .in("sku", chave);
      if (error) throw error;
      const m = new Map<string, ImagemProduto>();
      for (const r of data ?? []) m.set(r.sku, { imagem_url: r.imagem_url, imagem_do_produto: r.imagem_do_produto !== false });
      return m;
    },
  });
  useEffect(() => {
    if (q.isError) toast.error(`Falha ao ler fotos dos produtos: ${rawMessage(q.error)}`);
  }, [q.isError, q.error]);
  return q;
}

/** Miniatura com selo "ilustrativa" quando a foto é da coleção/cor, e placeholder neutro sem imagem. */
export function ProdutoMiniatura({ img, tamanho, className }: { img?: ImagemProduto; tamanho: number; className?: string }) {
  const url = img?.imagem_url;
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-md border bg-muted", className)}
      style={{ width: tamanho, height: tamanho }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon style={{ width: tamanho * 0.4, height: tamanho * 0.4 }} />
        </div>
      )}
      {url && img && !img.imagem_do_produto && tamanho >= 40 && (
        <span className="absolute inset-x-0 bottom-0 bg-background/80 text-center text-[9px] leading-3 text-muted-foreground">
          ilustrativa
        </span>
      )}
    </div>
  );
}
