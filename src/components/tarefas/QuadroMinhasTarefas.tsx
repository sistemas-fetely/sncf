import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock, ChevronDown, ChevronUp, ExternalLink, GripVertical, ListChecks, Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PRIORIDADE_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { useAlterarStatusTarefa } from "@/hooks/tarefas/useTarefaMutations";
import { useStatusTarefaDim, type StatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import type { TarefaStatus } from "@/hooks/tarefas/useTarefas";
import type { TarefaComPapel } from "@/hooks/tarefas/useMinhasTarefasPapel";

const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export type AgruparPor = "status" | "projeto";

interface Props {
  /** raízes já agrupadas por projeto (chave = projeto_id ou "__sem__") */
  grupos: [string, TarefaComPapel[]][];
  /** concluídas dos últimos 7 dias — coluna própria no modo status */
  concluidasRecentes?: TarefaComPapel[];
  filhasPorMae: Map<string, TarefaComPapel[]>;
  somenteLeitura: boolean;
  nomeProjeto: (id: string) => string;
  agruparPor: AgruparPor;
}

interface Coluna {
  chave: string;
  titulo: string;
  itens: TarefaComPapel[];
  /** só no modo projeto: link para o board do projeto */
  projetoId?: string | null;
}

/**
 * Visão Kanban de Minhas Tarefas. Por STATUS, as colunas são os status com
 * e_aberto na dimensão — nunca lista fixa. Por PROJETO, uma coluna por projeto
 * e arraste desligado (arrastar entre projetos não é troca de status).
 * Contêiner aparece como card com selo de progresso, mas NÃO arrasta.
 */
export function QuadroMinhasTarefas({
  grupos, concluidasRecentes = [], filhasPorMae, somenteLeitura, nomeProjeto, agruparPor,
}: Props) {
  const { abrir: abrirTarefa } = useTarefaAberta();
  const alterarStatus = useAlterarStatusTarefa();
  const { data: statusDim } = useStatusTarefaDim();
  const [alvo, setAlvo] = useState<string | null>(null);
  const [passosAbertos, setPassosAbertos] = useState<Record<string, boolean>>({});
  /** otimista: status exibido até a mutation confirmar; rollback em erro */
  const [otimista, setOtimista] = useState<Record<string, TarefaStatus>>({});
  const [pedido, setPedido] = useState<{ tarefaId: string; status: StatusTarefaDim } | null>(null);
  const [motivo, setMotivo] = useState("");

  const abertos = (statusDim ?? []).filter((s) => s.e_aberto);
  const arrastavelNoModo = agruparPor === "status" && !somenteLeitura;
  /** abertas + concluídas recentes — base do modo status e do lookup no arraste */
  const todas = [
    ...grupos.flatMap(([, lista]) => lista),
    ...concluidasRecentes,
  ];
  const rotulo = (codigo: string) => statusDim?.find((s) => s.codigo === codigo)?.nome ?? codigo;

  let colunas: Coluna[];
  if (agruparPor === "status") {
    const chaves = [...abertos.map((s) => s.codigo), "concluida"];
    const porColuna = new Map<string, TarefaComPapel[]>(chaves.map((c) => [c, []]));
    for (const t of todas) {
      const col = porColuna.get(otimista[t.id] ?? t.status);
      if (col) col.push(t);
    }
    colunas = [
      ...abertos.map((s) => ({
        chave: s.codigo,
        titulo: s.nome,
        itens: porColuna.get(s.codigo) ?? [],
      })),
      {
        chave: "concluida",
        titulo: `${rotulo("concluida")} · últimos 7 dias`,
        itens: porColuna.get("concluida") ?? [],
      },
    ];
  } else {
    colunas = grupos.map(([chave, lista]) => ({
      chave,
      titulo: nomeProjeto(chave),
      itens: lista,
      projetoId: chave === "__sem__" ? null : chave,
    }));
  }

  async function mover(tarefaId: string, status: string, motivoTexto?: string) {
    setOtimista((o) => ({ ...o, [tarefaId]: status as TarefaStatus }));
    try {
      await alterarStatus.mutateAsync({
        id: tarefaId,
        status: status as TarefaStatus,
        motivo: motivoTexto ?? null,
      });
    } catch (err) {
      setOtimista((o) => {
        const { [tarefaId]: _removido, ...resto } = o;
        return resto;
      });
      toast.error(
        `Não foi possível mover para "${rotulo(status)}": ${err instanceof Error ? err.message : "erro inesperado"}`
      );
    }
  }

  function soltar(status: string, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    const tarefaId = e.dataTransfer.getData("text/tarefa-id");
    if (!tarefaId) return;
    const tarefa = todas.find((t) => t.id === tarefaId);
    if (!tarefa || tarefa.eh_container) return;
    if ((otimista[tarefaId] ?? tarefa.status) === status) return;

    const dim = abertos.find((s) => s.codigo === status);
    if (dim?.exige_motivo) {
      setMotivo("");
      setPedido({ tarefaId, status: dim });
      return;
    }
    void mover(tarefaId, status);
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {colunas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nada para mostrar.</p>
        )}
        {colunas.map((coluna) => (
          <div
            key={coluna.chave}
            onDragOver={(e) => {
              if (!arrastavelNoModo) return;
              e.preventDefault();
              setAlvo(coluna.chave);
            }}
            onDragLeave={() => setAlvo((a) => (a === coluna.chave ? null : a))}
            onDrop={(e) => {
              if (!arrastavelNoModo) return;
              soltar(coluna.chave, e);
            }}
            className={cn(
              "flex w-[280px] shrink-0 flex-col rounded-xl border bg-muted/30 p-3",
              alvo === coluna.chave && arrastavelNoModo && "border-primary bg-primary/5"
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{coluna.titulo}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="outline">{coluna.itens.length}</Badge>
                {agruparPor === "projeto" && coluna.projetoId && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={`/tarefas/projetos/${coluna.projetoId}`}
                          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          aria-label="Abrir board do projeto"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>Abrir board</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {coluna.itens.length === 0 && (
                <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
                  Nada aqui.
                </p>
              )}
              {coluna.itens.map((t) => {
                const arrastavel = arrastavelNoModo && !t.eh_container;
                const limite = dataCurta(t.data_limite);
                const filhas = filhasPorMae.get(t.id) ?? [];
                const total = t.filhas_total ?? filhas.length;
                const feitas = t.filhas_concluidas ?? filhas.filter((f) => f.status === "concluida").length;
                const passosVisiveis = !!passosAbertos[t.id];
                const statusExibido = otimista[t.id] ?? t.status;

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
                                : agruparPor === "projeto"
                                  ? "Agrupado por projeto: arraste só na visão por status"
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
                      {agruparPor === "projeto" ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {rotulo(statusExibido)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {nomeProjeto(t.projeto_id ?? "__sem__")}
                        </Badge>
                      )}
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

                    {t.motivo_estado && (
                      <p className="text-[11px] text-muted-foreground">
                        {rotulo(statusExibido)}: {t.motivo_estado}
                      </p>
                    )}

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
        ))}
      </div>

      {/* status com exige_motivo não move sem explicação — cancelar deixa o card onde estava */}
      <Dialog open={!!pedido} onOpenChange={(v) => !v && setPedido(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Por que está {pedido?.status.nome.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              {pedido?.status.descricao ??
                "Esse status exige um motivo — quem olhar depois precisa entender a parada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-estado">Motivo</Label>
            <Textarea
              id="motivo-estado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: esperando resposta do fornecedor"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedido(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim()}
              onClick={() => {
                if (!pedido) return;
                const { tarefaId, status } = pedido;
                const texto = motivo.trim();
                setPedido(null);
                void mover(tarefaId, status.codigo, texto);
              }}
            >
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
