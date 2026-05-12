import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCategoriasFolha, type CategoriaFolhaTipo } from "@/hooks/compras/useCategoriasFolha";

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  tipo?: CategoriaFolhaTipo;
  disabled?: boolean;
}

export function CategoriaFolhaSelect({ value, onChange, tipo = "despesa", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { data: folhas = [], isLoading } = useCategoriasFolha(tipo);
  const selecionada = useMemo(() => folhas.find((f) => f.id === value), [folhas, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : selecionada ? (
            <span className="truncate">{selecionada.path}</span>
          ) : (
            <span>Selecione a categoria...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {folhas.map((f) => (
                <CommandItem
                  key={f.id}
                  value={f.path}
                  onSelect={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === f.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="text-sm">{f.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
