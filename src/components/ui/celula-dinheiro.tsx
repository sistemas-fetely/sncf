import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §5 e §8 — dinheiro alinha a DIREITA com numeral tabular.
 * Sem isso a virgula nao alinha e o olho nao compara valores sem ler digito por digito.
 */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface CelulaDinheiroProps {
  valor: number | null | undefined;
  /** texto miudo abaixo do valor (ex: "custo pendente") */
  nota?: string;
  /** quando true, mostra travessao no lugar do valor */
  indisponivel?: boolean;
  className?: string;
}

export function CelulaDinheiro({ valor, nota, indisponivel, className }: CelulaDinheiroProps) {
  const mostra = !indisponivel && valor != null;
  return (
    <TableCell className={cn("text-right tabular-nums", className)}>
      {nota ? (
        <div className="flex flex-col items-end">
          <span>{mostra ? BRL.format(Number(valor)) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">{nota}</span>
        </div>
      ) : (
        <span>{mostra ? BRL.format(Number(valor)) : "—"}</span>
      )}
    </TableCell>
  );
}
