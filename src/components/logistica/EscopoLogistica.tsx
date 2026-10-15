import { useState } from "react";
import { Check, ChevronsUpDown, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";
import { nomeCurtoTransportadora, type EscopoLogisticaValor } from "@/lib/logistica/escopo";

const CANAIS = [{ valor: "total", label: "Total" }, { valor: "b2b", label: "B2B" }, { valor: "b2c", label: "B2C" }] as const;

export function EscopoLogistica({ transportadoras, escopo, onChange }: {
  transportadoras: TransportadoraLogistica[];
  escopo: EscopoLogisticaValor;
  onChange: (escopo: EscopoLogisticaValor) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ativa = transportadoras.find((t) => t.id === escopo.valor);
  const nome = escopo.tipo === "transportadora"
    ? (ativa ? nomeCurtoTransportadora(ativa) : "Transportadora não encontrada")
    : CANAIS.find((c) => c.valor === escopo.valor)?.label ?? "Total";
  const escolher = (novo: EscopoLogisticaValor) => { onChange(novo); setAberto(false); };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={aberto} aria-label={`Escopo: ${nome}`} className="w-full min-w-0 gap-2 md:w-auto md:max-w-72">
          {escopo.tipo === "transportadora" && <Truck className="h-4 w-4 shrink-0" />}
          <span className="truncate">Escopo: {nome}</span>
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder="Buscar escopo…" />
          <CommandList>
            <CommandEmpty>Nenhum escopo encontrado.</CommandEmpty>
            <CommandGroup heading="Canal">
              {CANAIS.map((c) => <CommandItem key={c.valor} value={c.label} onSelect={() => escolher({ tipo: "canal", valor: c.valor })}>
                <span className="flex-1">{c.label}</span>
                {escopo.tipo === "canal" && escopo.valor === c.valor && <Check className="h-4 w-4" />}
              </CommandItem>)}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Transportadoras">
              {[...transportadoras].sort((a, b) => nomeCurtoTransportadora(a).localeCompare(nomeCurtoTransportadora(b), "pt-BR")).map((t) => (
                <CommandItem key={t.id} value={t.id} keywords={[nomeCurtoTransportadora(t), t.razao_social, t.cidade ?? "", t.uf ?? ""]} onSelect={() => escolher({ tipo: "transportadora", valor: t.id })}>
                  <Truck className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="break-words">{nomeCurtoTransportadora(t)}</div>
                    <div className="text-xs text-muted-foreground">{[t.cidade, t.uf].filter(Boolean).join("/")}</div>
                  </div>
                  {escopo.tipo === "transportadora" && escopo.valor === t.id && <Check className="ml-2 h-4 w-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}