import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  useTitulosParaVinculo, useTituloVinculado, type TituloParaVinculo,
} from "@/hooks/tarefas/useTitulosParaVinculo";

interface Props {
  tituloId: string | null;
  onChange: (titulo: TituloParaVinculo | null) => void;
  disabled?: boolean;
}

function fmt(d: string | null) {
  if (!d) return "sem vencimento";
  try {
    return format(parseISO(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
}

/** Combobox com busca por código e por cliente. Encerrados no fim, nunca escondidos. */
export function SeletorTituloVinculo({ tituloId, onChange, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const { data: titulos, isLoading } = useTitulosParaVinculo(busca);
  const { data: atual } = useTituloVinculado(tituloId);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-8 w-full min-w-0 justify-between text-sm font-normal"
        >
          <span className="truncate">
            {tituloId ? (atual?.codigo ?? "Título vinculado") : "Escolha o título"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código ou cliente…"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Buscando…</div>
            ) : (
              <CommandEmpty>Nenhum título encontrado</CommandEmpty>
            )}
            <CommandGroup>
              {(titulos ?? []).map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  onSelect={() => {
                    onChange(t.id === tituloId ? null : t);
                    setAberto(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      t.id === tituloId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-mono text-sm font-medium",
                          t.encerrado && "text-muted-foreground",
                          t.vencido && !t.encerrado && "text-destructive",
                        )}
                      >
                        {t.codigo}
                      </span>
                      {t.vencido && !t.encerrado && (
                        <span className="rounded border border-destructive/40 bg-destructive/10 px-1 text-[10px] text-destructive">
                          vencido
                        </span>
                      )}
                      {t.encerrado && (
                        <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                          encerrado
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t.cliente || "sem cliente"} · {fmt(t.vencimento)}
                      {t.pedido_codigo ? ` · ${t.pedido_codigo}` : ""}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
