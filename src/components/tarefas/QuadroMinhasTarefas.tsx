import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, GripVertical, ListChecks, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PRIORIDADE_ROTULO, STATUS_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { useAlterarStatusTarefa } from "@/hooks/tarefas/useTarefaMutations";
import type { TarefaStatus } from "@/hooks/tarefas/useTarefas";
import type { TarefaComPapel } from "@/hooks/tarefas/useMinhasTarefasPapel";

/** colunas do quadro: os três status abertos, sempre visíveis */
const COLUNAS: TarefaStatus[] = ["pendente", "em_andamento", "em_revisao"];

const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

interface Props {
  /** raízes já agrupadas por projeto (chave ignorada aqui: coluna é o status) */
  grupos: [string, TarefaComPapel[]][];
  filhasPorMae: Map<string, TarefaComPapel[]>;
  somenteLeitura: boolean;
  nomeProjeto: (id: string) => string;
}

/**
 * Visão Kanban de Minhas Tarefas. As tarefas vêm de vários projetos, então a
 * coluna é o STATUS — não existe seção comum. Contêiner aparece como card com
 * selo de progresso, mas NÃO arrasta: fecha pelo progresso das filhas.
 */
export function QuadroMinhasTarefas({ grupos, filhasPorMae, somenteLeitura, nomeProjeto }: Props) {
  const { abrir: abrirTarefa } = useTarefaAberta();
  const alterarStatus = useAlterarStatusTarefa();
  const [alvo, setAlvo] = useState<TarefaStatus | null>(null);
  const [passosAbertos, setPassosAbertos] = useState<Record<string, boolean>>({});
  /** otimista: status exibido até a mutation confirmar; rollback em erro */
  const [otimista, setOtimista] = useState<Record<string, TarefaStatus>>({});

  const todas = grupos.flatMap(([, lista]) => lista);
  const porColuna = new Map<TarefaStatus, TarefaComPapel[]>(COLUNAS.map((c) => [c, []]));
  for (const t of todas) {
    const status = otimista[t.id] ?? t.status;
    const col = porColuna.get(status as TarefaStatus);
    if (col) col.push(t);
  }

  async function soltar(status: TarefaStatus, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    const tarefaId = e.dataTransfer.getData("text/tarefa-id");
    if (!tarefaId) return;
    const tarefa = todas.find((t) => t.id === tarefaId);
    if (!tarefa || tarefa.eh_container) return;
    const atual = otimista[tarefaId] ?? tarefa.status;
    if (atual === status) return;

    setOtimista((o) => ({ ...o, [tarefaId]: status }));
    try {
      await alterarStatus.mutateAsync({ id: tarefaId, status });
    } catch (err) {
      // rollback do otimista; a mutation já tosta o erro, aqui reforçamos o contexto
      setOtimista((o) => {
        const { [tarefaId]: _removido, ...resto } = o;
        return resto;
      });
      toast.error(
        `Não foi possível mover para "${STATUS_ROTULO[status] ?? status}": ${err instanceof Error ? err.message : "erro inesperado"}`
      );
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUNAS.map((status) => {
        const itens = porColuna.get(status) ?? [];
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (somenteLeitura) return;
              e.preventDefault();
              setAlvo(status);
            }}
            onDragLeave={() => setAlvo((a) => (a === status ? null : a))}
            onDrop={(e) => {
              if (somenteLeitura) return;
              void soltar(status, e);
            }}
            className={cn(
              "flex w-[280px] shrink-0 flex-col rounded-xl border bg-muted/30 p-3",
              alvo === status && !somenteLeitura && "border-primary bg-primary/5"
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{STATUS_ROTULO[status]}</span>
              <Badge variant="outline" className="shrink-0">{itens.length}</Badge>
            </div>

            <div className="flex flex-col gap-2">
              {itens.length === 0 && (
                <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
                  Nada aqui.
                </p>
              )}
              {itens.map((t) => {
                const arrastavel = !somenteLeitura && !t.eh_container;
                const limite = dataCurta(t.data_limite);
                const filhas = filhasPorMae.get(t.id) ?? [];
                const total = t.filhas_total ?? filhas.length;
                const feitas = t.filhas_concluidas ?? filhas.filter((f) => f.status === "concluida").length;
                const passosVisiveis = !!passosAbertos[t.id];

                return (
                  <Card
                    key={t.id}
                    draggable={arrastavel}
                    onDragStart={(e) => {
                      if (!arrastavel) return;
                      e.dataTransfer.setData("text/tarefa-id", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => abrirTarefa(t.id)}
                    className={cn(
                      "cursor-pointer space-y-2 border p-3 transition hover:shadow-sm",
                      arrastavel ? "active:opacity-70" : "opacity-95"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {arrastavel ? (
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {t.eh_container
                                ? "Agrupador: fecha pelo progresso das subtarefas, não arrasta"
                                : "Somente leitura nesta aba"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium leading-snug">{t.titulo}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={cn("text-[10px]", PRIORIDADE_CLASSE[t.prioridade])}>
                        {PRIORIDADE_ROTULO[t.prioridade]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {nomeProjeto(t.projeto_id ?? "__sem__")}
                      </Badge>
                      {limite && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarClock className="h-3 w-3" /> {limite}
                        </span>
                      )}
                      {total > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPassosAbertos((a) => ({ ...a, [t.id]: !a[t.id] }));
                                }}
                                className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground transition hover:bg-muted"
                              >
                                <ListChecks className="h-3 w-3" />
                                {feitas}/{total}
                                {passosVisiveis ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {passosVisiveis ? "Esconder as subtarefas" : "Ver as subtarefas"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {passosVisiveis && filhas.length > 0 && (
                      <div className="space-y-1 border-t pt-1.5" onClick={(e) => e.stopPropagation()}>
                        {filhas.map((f) => (
                          <div key={f.id} className="flex items-start gap-2">
                            <Checkbox
                              className="mt-0.5"
                              disabled={somenteLeitura}
                              checked={f.status === "concluida"}
                              onCheckedChange={(v) =>
                                alterarStatus.mutate({
                                  id: f.id,
                                  status: v ? "concluida" : "em_andamento",
                                })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => abrirTarefa(f.id)}
                              className={cn(
                                "min-w-0 flex-1 text-left text-[11px] leading-snug hover:underline",
                                f.status === "concluida" && "text-muted-foreground line-through"
                              )}
                            >
                              {f.titulo}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
