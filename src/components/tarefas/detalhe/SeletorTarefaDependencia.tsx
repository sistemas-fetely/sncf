import { useState } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useBuscarTarefasParaDependencia } from "@/hooks/tarefas/useTarefaBloqueio";
import { useStatusRotulo } from "./comuns";

interface Props {
  /** tarefa atual — nunca aparece na lista */
  tarefaId: string;
  /** ids já ligados, para não oferecer duplicata */
  jaLigados: string[];
  onEscolher: (id: string) => void;
  disabled?: boolean;
}

/** Combobox com busca, no mesmo padrão do seletor de pessoa. */
export function SeletorTarefaDependencia({ tarefaId, jaLigados, onEscolher, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const { data: tarefas, isLoading } = useBuscarTarefasParaDependencia(busca, tarefaId);
  const rotuloStatus = useStatusRotulo();

  const lista = (tarefas ?? []).filter((t) => !jaLigados.includes(t.id));

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          disabled={disabled}
          className="h-8 justify-between text-sm font-normal"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar dependência
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar tarefa pelo título…"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Buscando…</div>
            ) : (
              <CommandEmpty>Nenhuma tarefa encontrada</CommandEmpty>
            )}
            <CommandGroup>
              {lista.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  onSelect={() => {
                    onEscolher(t.id);
                    setAberto(false);
                    setBusca("");
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{t.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">{rotuloStatus(t.status)}</p>
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
