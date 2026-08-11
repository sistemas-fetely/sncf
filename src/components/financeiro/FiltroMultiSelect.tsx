import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (next: string[]) => void;
  rotulo?: (valor: string) => string;
  className?: string;
}

/** Select múltiplo simples (popover + lista clicável). Somente leitura de filtro. */
export function FiltroMultiSelect({
  label,
  opcoes,
  selecionados,
  onChange,
  rotulo,
  className,
}: Props) {
  function toggle(v: string) {
    onChange(
      selecionados.includes(v)
        ? selecionados.filter((x) => x !== v)
        : [...selecionados, v],
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-between gap-2 font-normal", className)}
          disabled={opcoes.length === 0}
        >
          <span className="text-muted-foreground">{label}</span>
          {selecionados.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {selecionados.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-auto">
          {opcoes.map((o) => {
            const ativo = selecionados.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border",
                    ativo ? "bg-primary border-primary" : "border-input",
                  )}
                >
                  {ativo && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className="truncate">{rotulo ? rotulo(o) : o}</span>
              </button>
            );
          })}
        </div>
        {selecionados.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            Limpar seleção
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
