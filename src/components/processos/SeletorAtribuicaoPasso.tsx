// Combobox de atribuição para o passo do processo. Mostra quem executa e o tempo unitário.
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { useAtribuicoesParaPasso } from "@/hooks/processos/useProcessoPassos";

interface Props {
  valor: string | null;
  onChange: (id: string | null) => void;
}

export function SeletorAtribuicaoPasso({ valor, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const { data: atribuicoes, isLoading } = useAtribuicoesParaPasso();
  const escolhida = (atribuicoes ?? []).find((a) => a.atribuicao_id === valor);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {escolhida ? (escolhida.nome ?? "sem nome") : "Nenhuma atribuição ligada"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar atribuição, pessoa…" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Carregando…" : "Nenhuma atribuição encontrada."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__nenhuma__ nenhuma sem atribuicao"
                onSelect={() => {
                  onChange(null);
                  setAberto(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", valor ? "opacity-0" : "opacity-100")} />
                <span className="text-muted-foreground">— nenhuma —</span>
              </CommandItem>
              {(atribuicoes ?? []).map((a) => (
                <CommandItem
                  key={a.atribuicao_id}
                  value={`${a.nome ?? ""} ${a.pessoa_nome ?? ""} ${a.atribuicao_id}`}
                  onSelect={() => {
                    onChange(a.atribuicao_id);
                    setAberto(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      valor === a.atribuicao_id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{a.nome ?? "sem nome"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {a.pessoa_nome ?? "sem dono"}
                      {a.tempo_unitario_min != null ? ` · ${a.tempo_unitario_min} min/unidade` : ""}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
