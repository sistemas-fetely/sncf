import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useStatusRotulo } from "@/components/tarefas/detalhe/comuns";
import {
  useRebaixarTarefa, useTarefasPrincipaisDoProjeto,
} from "@/hooks/tarefas/useTarefaHierarquia";

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  projetoId: string;
  tarefa: { id: string; titulo: string } | null;
}

/**
 * Transforma uma tarefa principal em subtarefa de outra do mesmo projeto.
 * Não existe subtarefa de subtarefa — a lista só traz tarefas principais.
 */
export function RebaixarTarefaDialog({ aberto, onOpenChange, projetoId, tarefa }: Props) {
  const [busca, setBusca] = useState("");
  const rotuloStatus = useStatusRotulo();
  const rebaixar = useRebaixarTarefa();
  const { data: candidatas, isLoading } = useTarefasPrincipaisDoProjeto(
    aberto ? projetoId : null,
    tarefa?.id ?? null,
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = candidatas ?? [];
    if (!termo) return base;
    return base.filter((t) => t.titulo.toLowerCase().includes(termo));
  }, [candidatas, busca]);

  if (!tarefa) return null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { onOpenChange(v); if (!v) setBusca(""); }}>
      <DialogContent className="p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Transformar “{tarefa.titulo}” em subtarefa de…</DialogTitle>
          <DialogDescription>
            Escolha a tarefa mãe. Ela passa a agrupar esta como passo.
          </DialogDescription>
        </DialogHeader>
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
              <CommandEmpty>Nenhuma tarefa principal disponível</CommandEmpty>
            )}
            <CommandGroup>
              {lista.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  disabled={rebaixar.isPending}
                  onSelect={async () => {
                    try {
                      await rebaixar.mutateAsync({ tarefaId: tarefa.id, parentId: t.id });
                      onOpenChange(false);
                      setBusca("");
                    } catch {
                      // toast já exibido pelo hook; o diálogo fica aberto
                    }
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
      </DialogContent>
    </Dialog>
  );
}
