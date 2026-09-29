import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { ProdutoMiniatura, useImagensProduto } from "@/components/venda-direta/ProdutoMiniatura";

export interface ProdutoVarejo {
  sku: string;
  nome_completo: string | null;
  preco_varejo: number;
}

/** Mesmo combobox da tela de Transferências, restrito a produtos ativos com preço de varejo. */
export function ProdutoVarejoCombobox({
  value,
  onSelect,
  ariaLabel,
}: {
  value: string;
  onSelect: (p: ProdutoVarejo) => void;
  ariaLabel: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const buscaQ = useQuery({
    queryKey: ["venda-direta-busca-sku", debounced],
    enabled: aberto && debounced.length >= 2,
    queryFn: async (): Promise<ProdutoVarejo[]> => {
      const t = debounced.replace(/[,()%*]/g, " ").trim();
      const { data, error } = await (supabase as any)
        .from("sncf_produtos")
        .select("sku, nome_completo, preco_varejo")
        .eq("ativo", true)
        .gt("preco_varejo", 0)
        .or(`sku.ilike.%${t}%,nome_completo.ilike.%${t}%`)
        .order("sku")
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, preco_varejo: Number(p.preco_varejo) }));
    },
  });
  const imgsQ = useImagensProduto((buscaQ.data ?? []).map((p) => p.sku));

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={aberto}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || "Buscar SKU ou nome…"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Digite SKU ou nome…" value={termo} onValueChange={setTermo} />
          <CommandList>
            {debounced.length < 2 ? (
              <CommandEmpty>Digite ao menos 2 caracteres.</CommandEmpty>
            ) : buscaQ.isFetching ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : buscaQ.isError ? (
              <p className="p-3 text-sm text-destructive">Falha na busca: {formatError(buscaQ.error)}</p>
            ) : (
              <>
                <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                <CommandGroup>
                  {(buscaQ.data ?? []).map((p) => (
                    <CommandItem
                      key={p.sku}
                      value={p.sku}
                      onSelect={() => {
                        onSelect(p);
                        setAberto(false);
                        setTermo("");
                      }}
                    >
                      <Check className={cn("h-4 w-4", value === p.sku ? "opacity-100" : "opacity-0")} />
                      <ProdutoMiniatura img={imgsQ.data?.get(p.sku)} tamanho={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nome_completo ?? p.sku}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">{p.sku}</span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">{formatBRL(p.preco_varejo)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
