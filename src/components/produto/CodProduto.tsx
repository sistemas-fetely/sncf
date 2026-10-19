import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Selo } from "@/components/ui/selo";
import { useCodigoProdutoMap } from "@/hooks/useCodigoProdutoMap";
import { cn } from "@/lib/utils";

interface Props {
  chave: string | null | undefined;
  variant?: "padrao" | "compacto";
  className?: string;
}

/** Identificador padrão do produto: cod_cadastro em destaque, sku secundário. */
export function CodProduto({ chave, variant = "padrao", className }: Props) {
  const { resolver, isLoading } = useCodigoProdutoMap();
  if (isLoading) return <Skeleton className="h-4 w-12" />;
  const r = resolver(chave);

  if (!r.cadastrado) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        <span className="font-mono text-xs">{chave?.trim() || "—"}</span>
        {chave?.trim() && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span><Selo estado="warning">sem cadastro</Selo></span>
            </TooltipTrigger>
            <TooltipContent>SKU não encontrado no cadastro de produtos</TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  }

  if (variant === "compacto") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("font-mono text-xs font-medium", className)}>{r.cod}</span>
        </TooltipTrigger>
        <TooltipContent className="font-mono">{r.sku}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className="font-mono text-sm font-medium">{r.cod}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{r.sku}</span>
    </span>
  );
}

export default CodProduto;
