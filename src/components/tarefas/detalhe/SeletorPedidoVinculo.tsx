import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  usePedidosParaVinculo, usePedidoVinculado, type PedidoParaVinculo,
} from "@/hooks/tarefas/usePedidosParaVinculo";

interface Props {
  pedidoId: string | null;
  onChange: (pedido: PedidoParaVinculo | null) => void;
  disabled?: boolean;
}

/** Combobox com busca por código e por cliente. Encerrados no fim, nunca escondidos. */
export function SeletorPedidoVinculo({ pedidoId, onChange, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const { data: pedidos, isLoading } = usePedidosParaVinculo(busca);
  const { data: atual } = usePedidoVinculado(pedidoId);

  return (
    <div className="flex items-center gap-1">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-8 min-w-0 flex-1 justify-between text-sm font-normal"
          >
            <span className="truncate">
              {pedidoId ? (atual?.codigo ?? "Pedido vinculado") : "Sem pedido vinculado"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0">
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
                <CommandEmpty>Nenhum pedido encontrado</CommandEmpty>
              )}
              <CommandGroup>
                {(pedidos ?? []).map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onChange(p.id === pedidoId ? null : p);
                      setAberto(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        p.id === pedidoId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium", p.encerrado && "text-muted-foreground")}>
                          {p.codigo}
                        </span>
                        {p.encerrado && (
                          <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                            encerrado
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.cliente || "sem cliente"}
                        {p.estagio ? ` · ${p.estagio.replace(/_/g, " ")}` : ""}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {pedidoId && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Tirar o vínculo com o pedido"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
