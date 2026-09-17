import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DirecaoOrdenacao = "asc" | "desc";

/**
 * Cabecalho de tabela clicavel: 1o clique ordena, 2o inverte, 3o devolve a
 * tabela a ordem padrao. Quem decide o ciclo e o dono do estado — este
 * componente so pinta o rotulo, a seta e o aria-sort.
 *
 * Nasceu compartilhado de proposito: cabecalho ordenavel copiado e colado
 * diverge na terceira tela.
 */
export function CabecalhoOrdenavel({
  rotulo,
  dir,
  onOrdenar,
  className,
  alinharDireita,
}: {
  rotulo: string;
  /** null = coluna inativa */
  dir: DirecaoOrdenacao | null;
  onOrdenar: () => void;
  className?: string;
  alinharDireita?: boolean;
}) {
  return (
    <TableHead
      className={className}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={onOrdenar}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
          dir && "text-foreground",
          alinharDireita && "w-full justify-end",
        )}
        title={
          dir === "asc"
            ? "Crescente — clique para inverter"
            : dir === "desc"
              ? "Decrescente — clique para voltar à ordenação padrão"
              : `Ordenar por ${rotulo}`
        }
      >
        {rotulo}
        {dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : dir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

/**
 * Linha de cabecalho colada: fica logo abaixo do bloco colado de cima, cuja
 * altura a tela publica em `--fila-topo-colado`. Fundo `muted` (§2: muted e
 * cabecalho de tabela) pintado na propria celula — fundo de <tr> nao acompanha
 * celula sticky. A borda inferior vai de inset shadow pelo mesmo motivo.
 */
export const LINHA_CABECALHO_COLADO =
  "bg-muted [&>th]:sticky [&>th]:top-[var(--fila-topo-colado,4rem)] [&>th]:z-10 [&>th]:bg-muted [&>th]:font-semibold [&>th]:text-foreground [&>th]:shadow-[inset_0_-1px_0_hsl(var(--border))]";
