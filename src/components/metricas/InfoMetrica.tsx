import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

interface MetricaDefinicao {
  slug: string;
  rotulo: string;
  o_que_e: string | null;
  formula: string | null;
  fonte: string | null;
  leitura: string | null;
}

/**
 * Definições de métricas (tabela `metrica_definicao`), em Map por slug.
 * Cache de 10 min: texto de apoio, muda raramente.
 */
export function useMetricasDefinicao() {
  return useQuery({
    queryKey: ["metrica-definicao"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, MetricaDefinicao>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("metrica_definicao")
        .select("slug, rotulo, o_que_e, formula, fonte, leitura")
        .eq("ativo", true);
      if (error) throw error;
      return new Map<string, MetricaDefinicao>(
        ((data ?? []) as MetricaDefinicao[]).map((d) => [d.slug, d]),
      );
    },
  });
}

/**
 * "i" discreto ao lado de um rótulo de métrica. Só aparece no hover do grupo
 * (`group` no pai) ou com foco de teclado. Clique abre popover com a memória
 * da métrica; stopPropagation para não disparar ordenação de cabeçalho.
 * Slug sem definição no banco → não renderiza nada.
 */
export function InfoMetrica({ slug }: { slug: string }) {
  const { data } = useMetricasDefinicao();
  const def = data?.get(slug);
  if (!def) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Como é calculado"
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-2">{def.rotulo}</div>
        <div className="space-y-2">
          {def.o_que_e && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">O que é</div>
              <div className="mt-0.5">{def.o_que_e}</div>
            </div>
          )}
          {def.formula && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fórmula</div>
              <div className="mt-0.5 font-mono text-[11px]">{def.formula}</div>
            </div>
          )}
          {def.fonte && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">De onde vem</div>
              <div className="mt-0.5">{def.fonte}</div>
            </div>
          )}
          {def.leitura && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Como ler</div>
              <div className="mt-0.5">{def.leitura}</div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
