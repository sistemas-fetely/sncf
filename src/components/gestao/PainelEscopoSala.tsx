import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FolderPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAdicionarEscopo, useRemoverEscopo } from "@/hooks/gestao/useGestaoSalas";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";

interface Props {
  salaId: string;
  escopo: string[];
  ehFacilitador: boolean;
}

/**
 * Escopo da sala (gestao_sala_escopo). PAUTA-SO-VE-O-ESCOPO: a pauta automática
 * só enxerga projetos listados aqui — sala sem escopo tem pauta vazia.
 */
export function PainelEscopoSala({ salaId, escopo, ehFacilitador }: Props) {
  const { data: projetos } = useProjetos();
  const adicionar = useAdicionarEscopo();
  const remover = useRemoverEscopo();

  const [popoverAberto, setPopoverAberto] = useState(false);
  const [novoProjetoId, setNovoProjetoId] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const nomeProjeto = (id: string) =>
    (projetos ?? []).find((p) => p.id === id)?.nome ?? "Projeto fora do catálogo ativo";

  const candidatos = useMemo(() => {
    const jaNoEscopo = new Set(escopo);
    return (projetos ?? []).filter((p) => !jaNoEscopo.has(p.id));
  }, [projetos, escopo]);

  const novoSelecionado = (projetos ?? []).find((p) => p.id === novoProjetoId) ?? null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Projetos acompanhados nesta sala ({escopo.length})</p>
          {!ehFacilitador && (
            <p className="text-[11px] text-muted-foreground">Só o facilitador gerencia o escopo.</p>
          )}
        </div>

        {escopo.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum projeto no escopo — a pauta automática desta sala fica vazia até o facilitador
            adicionar os projetos que este rito acompanha.
          </p>
        ) : (
          <div className="space-y-1.5">
            {escopo.map((projetoId) => (
              <div
                key={projetoId}
                className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
              >
                <p className="min-w-0 flex-1 truncate text-sm">{nomeProjeto(projetoId)}</p>
                {ehFacilitador && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${nomeProjeto(projetoId)} do escopo`}
                    onClick={() => setRemovendo(projetoId)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {ehFacilitador && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="h-8 min-w-[220px] justify-between font-normal">
                  {novoSelecionado ? (
                    <span className="truncate">{novoSelecionado.nome}</span>
                  ) : (
                    <span className="text-muted-foreground">Adicionar projeto…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar projeto..." />
                  <CommandList>
                    <CommandEmpty>Nenhum projeto ativo fora do escopo.</CommandEmpty>
                    <CommandGroup>
                      {candidatos.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.nome}
                          onSelect={() => {
                            setNovoProjetoId(p.id);
                            setPopoverAberto(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", novoProjetoId === p.id ? "opacity-100" : "opacity-0")}
                          />
                          <span className="flex-1 truncate">{p.nome}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              disabled={!novoProjetoId || adicionar.isPending}
              onClick={() =>
                adicionar.mutate(
                  { salaId, projetoId: novoProjetoId! },
                  { onSuccess: () => setNovoProjetoId(null) },
                )
              }
            >
              <FolderPlus className="mr-1 h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          A pauta automática só enxerga os projetos desta lista. Decisões, riscos e tarefas
          registrados na reunião também se penduram neles.
        </p>
      </CardContent>

      <AlertDialog open={!!removendo} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover projeto do escopo?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `“${nomeProjeto(removendo)}” sai do acompanhamento: ele deixa de aparecer na pauta automática desta sala. Decisões e riscos já registrados não são apagados.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!removendo) return;
                remover.mutate(
                  { salaId, projetoId: removendo },
                  { onSuccess: () => setRemovendo(null) },
                );
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
