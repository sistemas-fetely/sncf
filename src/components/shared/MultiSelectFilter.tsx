import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface MultiSelectFilterProps {
  label: string;
  plural: string;
  opcoes: { valor: string; rotulo: string; contagem: number }[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({ label, plural, opcoes, selecionados, onChange, className }: MultiSelectFilterProps) {
  const [aberto, setAberto] = useState(false);
  const texto = selecionados.length === 0 ? label : selecionados.length === 1
    ? opcoes.find((opcao) => opcao.valor === selecionados[0])?.rotulo ?? selecionados[0]
    : `${selecionados.length} ${plural}`;
  const alternar = (valor: string) => onChange(selecionados.includes(valor)
    ? selecionados.filter((item) => item !== valor) : [...selecionados, valor]);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-label={label} aria-expanded={aberto}
          title={texto}
          className={cn("h-10 justify-between bg-input-background px-3 py-2 font-normal", selecionados.length > 0 && "border-admin bg-admin/5 ring-1 ring-admin/30", className)}>
          <span className="truncate">{texto}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder={`Buscar ${plural}…`} />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              {opcoes.map((opcao) => (
                <CommandItem key={opcao.valor} value={opcao.valor} keywords={[opcao.rotulo]}
                  onSelect={() => alternar(opcao.valor)}
                  className={cn("gap-2", opcao.contagem === 0 && "opacity-50")}>
                  <Checkbox checked={selecionados.includes(opcao.valor)} aria-label={opcao.rotulo}
                    onClick={(evento) => evento.stopPropagation()} onCheckedChange={() => alternar(opcao.valor)} />
                  <span className="min-w-0 flex-1 truncate">{opcao.rotulo}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{opcao.contagem}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={!selecionados.length}>Limpar</Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}