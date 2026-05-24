import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Package, Truck, Wrench, Sparkles, TrendingDown } from "lucide-react";
import type { TipoLinha } from "@/lib/compras/types";

interface Props {
  onAdd: (tipo: TipoLinha) => void;
  disabled?: boolean;
}

export function AdicionarLinhaDropdown({ onAdd, disabled }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar linha
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onAdd("produto")}>
          <Package className="h-4 w-4 mr-2" />
          Item novo (produto sem pedido)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("frete")}>
          <Truck className="h-4 w-4 mr-2" />
          Frete
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("servico")}>
          <Wrench className="h-4 w-4 mr-2" />
          Serviço
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("extra")}>
          <Sparkles className="h-4 w-4 mr-2" />
          Extra / Taxa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("desconto")}>
          <TrendingDown className="h-4 w-4 mr-2 text-emerald-600" />
          Desconto (saving negociado)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
