import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna ordenável.
 * Padrão Fetely (estabelecido 27/04/2026): colunas ordenáveis em todas as tabelas
 * de listagem (Stage, Contas a Pagar, Caixa e Banco, etc).
 *
 * Uso:
 *   const [sort, setSort] = useState<SortState<"fornecedor" | "valor" | "data">>(null);
 *   <SortableTableHead column="fornecedor" sort={sort} onSort={setSort}>
 *     Fornecedor
 *   </SortableTableHead>
 *
 * Use o helper `aplicarSort` ou `ordenarPor` no useMemo de filtragem.
 */

export type SortDirection = "asc" | "desc";

export interface SortState<TColumn extends string> {
  column: TColumn;
  direction: SortDirection;
}

interface Props<TColumn extends string> {
  column: TColumn;
  sort: SortState<TColumn> | null;
  onSort: (next: SortState<TColumn> | null) => void;
  className?: string;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}

export function SortableTableHead<TColumn extends string>({
  column,
  sort,
  onSort,
  className,
  align = "left",
  children,
}: Props<TColumn>) {
  const ativo = sort?.column === column;
  const direction = ativo ? sort!.direction : null;

  function handleClick() {
    if (!ativo) {
      // Primeiro clique → asc
      onSort({ column, direction: "asc" });
    } else if (direction === "asc") {
      // Segundo clique → desc
      onSort({ column, direction: "desc" });
    } else {
      // Terceiro clique → limpa
      onSort(null);
    }
  }

  const alinha =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <TableHead className={cn("select-none", className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 w-full hover:text-foreground transition-colors",
          alinha,
          ativo ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        {!ativo && <ArrowUpDown className="h-3 w-3 opacity-40" />}
        {ativo && direction === "asc" && <ArrowUp className="h-3.5 w-3.5 text-admin" />}
        {ativo && direction === "desc" && <ArrowDown className="h-3.5 w-3.5 text-admin" />}
      </button>
    </TableHead>
  );
}

/**
 * Helper: ordena um array de objetos com base num SortState.
 * - getValor: função que extrai o valor a comparar pra cada item
 * - Trata strings (case-insensitive), números, datas, null/undefined
 */
export function ordenarPor<T, TColumn extends string>(
  list: T[],
  sort: SortState<TColumn> | null,
  resolvers: Record<TColumn, (item: T) => string | number | null | undefined>,
): T[] {
  if (!sort) return list;
  const fn = resolvers[sort.column];
  if (!fn) return list;
  const mult = sort.direction === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);

    // null/undefined sempre por último
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    // numérico
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * mult;
    }

    // string (lowercase, com locale BR)
    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    return sa.localeCompare(sb, "pt-BR") * mult;
  });
}
