import { useCallback, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, GripVertical, ListChecks, Lock, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { LinkOrigemTarefa } from "@/components/tarefas/LinkOrigemTarefa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNomePessoa, PRIORIDADE_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useFiltrosPersistentes } from "@/hooks/useFiltrosPersistentes";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { useAlterarStatusTarefa } from "@/hooks/tarefas/useTarefaMutations";
import { useStatusTarefaDim, type StatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import type { TarefaStatus } from "@/hooks/tarefas/useTarefas";
import {
  useCriarSecao, useCriarTarefaNaSecao, useExcluirSecao, useMoverTarefaSecao,
  usePodeGerenciarProjeto, useRenomearSecao, useReordenarSecoes, useSecoesProjeto,
  useTarefasDoProjeto, type TarefaBoard,
} from "@/hooks/tarefas/useProjetosTarefas";
import {
  formatarValorCampo, useCamposCatalogo, useCamposDoProjeto, useValoresCamposDoBoard,
} from "@/hooks/tarefas/useProjetoCampos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEM_SECAO = "__sem_secao__";
const DIAS_CONCLUIDAS = 7;

type AgruparPor = "secao" | "status";


const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

function iniciais(nome: string): string {
  return nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

interface Props {
  projetoId: string;
}

export function BoardProjeto({ projetoId }: Props) {
  const { user } = useAuth();
  const { abrir: abrirTarefa } = useTarefaAberta();
  const { data: secoes } = useSecoesProjeto(projetoId);
  const { data: tarefas, isLoading } = useTarefasDoProjeto(projetoId);
  const { data: podeGerenciar } = usePodeGerenciarProjeto(projetoId);
  const mover = useMoverTarefaSecao(projetoId);
  const criarSecao = useCriarSecao(projetoId);
  const renomear = useRenomearSecao(projetoId);
  const reordenar = useReordenarSecoes(projetoId);
  const excluir = useExcluirSecao(projetoId);
  const criarTarefa = useCriarTarefaNaSecao(projetoId);
  const alterarStatus = useAlterarStatusTarefa();

  const { data: vinculos } = useCamposDoProjeto(projetoId);
  const { data: catalogo } = useCamposCatalogo();
  const camposCard = useMemo(
    () => (vinculos ?? []).filter((v) => v.mostrar_no_card),
    [vinculos]
  );
  const tarefaIds = useMemo(() => (tarefas ?? []).map((t) => t.id), [tarefas]);
  const { data: valores } = useValoresCamposDoBoard(
    projetoId,
    tarefaIds,
    camposCard.map((c) => c.campo_id)
  );


  const [alvo, setAlvo] = useState<string | null>(null);
  const [novaSecao, setNovaSecao] = useState("");
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const [novaTarefaEm, setNovaTarefaEm] = useState<string | null>(null);
  const [passosAbertos, setPassosAbertos] = useState<Record<string, boolean>>({});
  const [tituloNovaTarefa, setTituloNovaTarefa] = useState("");
  /** a escolha do agrupamento sobrevive a sair e voltar do board */
  const [agruparPor, setAgruparPor] = useFiltrosPersistentes<AgruparPor>("board_agrupar", "secao");
  const { data: statusDim } = useStatusTarefaDim();
  /** status exibido até a mutation confirmar; rollback em erro */
  const [otimista, setOtimista] = useState<Record<string, TarefaStatus>>({});
  const [pedido, setPedido] = useState<{ tarefaId: string; status: StatusTarefaDim } | null>(null);
  const [motivo, setMotivo] = useState("");

  const statusAbertos = useMemo(
    () => (statusDim ?? []).filter((s) => s.e_aberto),
    [statusDim]
  );
  const rotuloStatus = useCallback(
    (codigo: string) => statusDim?.find((s) => s.codigo === codigo)?.nome ?? codigo,
    [statusDim]
  );

  /**
   * Modelo ClickUp: quem tem filha é contêiner e continua card (é o agrupador
   * visível no board); a FILHA não é card — vive dentro do card da mãe,
   * independentemente de quem seja o dono dela. Subtarefa cuja mãe não está
   * neste board continua card, senão desapareceria.
   */
  const idsNoBoard = useMemo(
    () => new Set((tarefas ?? []).map((t) => t.id)),
    [tarefas]
  );

  const ehCard = useCallback(
    (t: TarefaBoard) => !t.parent_id || !idsNoBoard.has(t.parent_id),
    [idsNoBoard]
  );

  /** filhas de cada mãe: alimentam o selo "3/7" e a lista enxuta dentro do card */
  const filhasPorMae = useMemo(() => {
    const mapa = new Map<string, TarefaBoard[]>();
    for (const t of tarefas ?? []) {
      if (!t.parent_id) continue;
      mapa.set(t.parent_id, [...(mapa.get(t.parent_id) ?? []), t]);
    }
    return mapa;
  }, [tarefas]);

  const ehContainer = useCallback(
    (t: TarefaBoard) => (filhasPorMae.get(t.id) ?? []).length > 0,
    [filhasPorMae]
  );

  const statusExibido = useCallback(
    (t: TarefaBoard) => otimista[t.id] ?? (t.status as TarefaStatus),
    [otimista]
  );

  /**
   * Seção = onde o trabalho está no fluxo; status = estado. Nunca existe coluna
   * "Concluídos" entre as seções — no modo status, sim: uma coluna de concluída
   * no fim, com recorte de 7 dias no cabeçalho.
   */
  const colunas = useMemo(() => {
    if (agruparPor === "status") {
      return [
        ...statusAbertos.map((s) => ({ id: s.codigo, nome: s.nome, fixa: true })),
        {
          id: "concluida",
          nome: `${rotuloStatus("concluida")} · últimos ${DIAS_CONCLUIDAS} dias`,
          fixa: true,
        },
      ];
    }
    const lista = [{ id: SEM_SECAO, nome: "Sem seção", fixa: true }];
    for (const s of secoes ?? []) lista.push({ id: s.id, nome: s.nome, fixa: false });
    return lista;
  }, [agruparPor, secoes, statusAbertos, rotuloStatus]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, TarefaBoard[]>();
    const visiveis = (tarefas ?? []).filter(ehCard);
    const corte = Date.now() - DIAS_CONCLUIDAS * 24 * 60 * 60 * 1000;
    for (const t of visiveis) {
      let chave: string;
      if (agruparPor === "status") {
        chave = statusExibido(t);
        if (chave === "concluida" && t.data_conclusao) {
          if (new Date(t.data_conclusao).getTime() < corte) continue;
        }
      } else {
        chave = t.secao_id ?? SEM_SECAO;
      }
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    return mapa;
  }, [tarefas, ehCard, agruparPor, statusExibido]);

  function podeArrastar(t: TarefaBoard): boolean {
    const permitido = !!podeGerenciar || t.responsavel_id === user?.id || t.criado_por === user?.id;
    if (!permitido) return false;
    // contêiner fecha pelo progresso das filhas — não muda de status arrastando
    if (agruparPor === "status" && ehContainer(t)) return false;
    return true;
  }

  /** FAIL-LOUD: otimista, await real, rollback e toast no erro. */
  async function trocarStatus(tarefaId: string, status: TarefaStatus, motivoTexto?: string) {
    setOtimista((o) => ({ ...o, [tarefaId]: status }));
    try {
      await alterarStatus.mutateAsync({ id: tarefaId, status, motivo: motivoTexto ?? null });
    } catch (err) {
      setOtimista((o) => {
        const { [tarefaId]: _fora, ...resto } = o;
        return resto;
      });
      toast.error(
        `Não foi possível mover para "${rotuloStatus(status)}": ${err instanceof Error ? err.message : "erro inesperado"}`
      );
    }
  }

  function soltar(colunaId: string, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    const tarefaId = e.dataTransfer.getData("text/tarefa-id");
    if (!tarefaId) return;
    const atual = (tarefas ?? []).find((t) => t.id === tarefaId);
    if (!atual) return;

    if (agruparPor === "status") {
      if (ehContainer(atual)) return;
      if (statusExibido(atual) === colunaId) return;
      // dimensão inteira, não só abertos: a coluna Concluída também é alvo
      const dim = statusDim?.find((s) => s.codigo === colunaId);
      if (dim?.exige_motivo) {
        setMotivo("");
        setPedido({ tarefaId, status: dim });
        return;
      }
      void trocarStatus(tarefaId, colunaId as TarefaStatus);
      return;
    }

    const destino = colunaId === SEM_SECAO ? null : colunaId;
    if ((atual.secao_id ?? null) === destino) return;
    mover.mutate({ tarefaId, secaoId: destino });
  }


  function mover1(id: string, direcao: -1 | 1) {
    const lista = (secoes ?? []).slice();
    const i = lista.findIndex((s) => s.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    reordenar.mutate(lista.map((s, idx) => ({ id: s.id, ordem: idx })));
  }

  const nomePessoa = useNomePessoa();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={novaSecao}
          onChange={(e) => setNovaSecao(e.target.value)}
          placeholder="Nome da nova seção"
          className="h-9 w-56"
          disabled={!podeGerenciar}
        />
        <Button
          size="sm"
          disabled={!podeGerenciar || !novaSecao.trim() || criarSecao.isPending}
          onClick={() => {
            criarSecao.mutate({ nome: novaSecao.trim(), ordem: (secoes?.length ?? 0) });
            setNovaSecao("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Nova seção
        </Button>

        {!podeGerenciar && (
          <span className="text-xs text-muted-foreground">
            Você não gerencia este projeto — seções são somente leitura.
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando board…</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map((col) => {
            const itens = porColuna.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setAlvo(col.id); }}
                onDragLeave={() => setAlvo((a) => (a === col.id ? null : a))}
                onDrop={(e) => soltar(col.id, e)}
                className={cn(
                  "flex w-[280px] shrink-0 flex-col rounded-xl border bg-muted/30 p-3",
                  alvo === col.id && "border-primary bg-primary/5"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{col.nome}</span>
                    <Badge variant="outline" className="shrink-0">{itens.length}</Badge>
                  </div>
                  {!col.fixa && podeGerenciar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRenomeando({ id: col.id, nome: col.nome })}>
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => mover1(col.id, -1)}>Mover para a esquerda</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => mover1(col.id, 1)}>Mover para a direita</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setExcluindo({ id: col.id, nome: col.nome })}
                        >
                          Excluir seção
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {renomeando?.id === col.id && (
                  <div className="mb-2 flex gap-1">
                    <Input
                      autoFocus
                      className="h-8"
                      value={renomeando.nome}
                      onChange={(e) => setRenomeando({ id: col.id, nome: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renomeando.nome.trim()) {
                          renomear.mutate({ id: col.id, nome: renomeando.nome.trim() });
                          setRenomeando(null);
                        }
                        if (e.key === "Escape") setRenomeando(null);
                      }}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {itens.map((t) => {
                    const arrastavel = podeArrastar(t);
                    const limite = dataCurta(t.data_limite);
                    const filhas = filhasPorMae.get(t.id) ?? [];
                    const feitas = filhas.filter((f) => f.status === "concluida").length;
                    const passosVisiveis = !!passosAbertos[t.id];
                    const camposDoCard = camposCard
                      .map((c) => {
                        const meta = catalogo?.find((k) => k.id === c.campo_id);
                        const valor = valores?.find((v) => v.tarefa_id === t.id && v.campo_id === c.campo_id);
                        if (!meta || !valor) return null;
                        return { nome: meta.nome, texto: formatarValorCampo(meta.tipo, valor.valor) };
                      })
                      .filter((x): x is { nome: string; texto: string } => !!x);

                    return (
                      <Card
                        key={t.id}
                        draggable={arrastavel}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/tarefa-id", t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => abrirTarefa(t.id)}
                        className={cn(
                          "cursor-pointer space-y-2 border p-3 transition hover:shadow-sm",
                          arrastavel ? "active:opacity-70" : "opacity-95",
                          t.status === "concluida" && "opacity-60"
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
                                <TooltipContent>Você não pode mover esta tarefa</TooltipContent>
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
                          <LinkOrigemTarefa acaoUrl={t.acao_url} />
                          {limite && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CalendarClock className="h-3 w-3" /> {limite}
                            </span>
                          )}
                          {filhas.length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPassosAbertos((a) => ({ ...a, [t.id]: !a[t.id] }));
                                    }}
                                    className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-muted"
                                  >
                                    <ListChecks className="h-3 w-3" />
                                    {feitas}/{filhas.length}
                                    {passosVisiveis ? (
                                      <ChevronUp className="h-3 w-3" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {passosVisiveis ? "Esconder os passos" : "Ver os passos desta tarefa"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {t.responsavel_id && (
                            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                              {iniciais(nomePessoa(t.responsavel_id))}
                            </span>
                          )}
                        </div>

                        {passosVisiveis && filhas.length > 0 && (
                          <div className="space-y-1 border-t pt-1.5" onClick={(e) => e.stopPropagation()}>
                            {filhas.map((f) => (
                              <div key={f.id} className="flex items-start gap-2">
                                <Checkbox
                                  className="mt-0.5"
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

                        {camposDoCard.length > 0 && (
                          <div className="space-y-0.5 border-t pt-1.5">
                            {camposDoCard.map((c) => (
                              <div key={c.nome} className="flex justify-between gap-2 text-[11px]">
                                <span className="text-muted-foreground">{c.nome}</span>
                                <span className="truncate font-medium">{c.texto}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}

                  {novaTarefaEm === col.id ? (
                    <Input
                      autoFocus
                      className="h-8"
                      placeholder="Título da tarefa"
                      value={tituloNovaTarefa}
                      onChange={(e) => setTituloNovaTarefa(e.target.value)}
                      onBlur={() => { setNovaTarefaEm(null); setTituloNovaTarefa(""); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tituloNovaTarefa.trim()) {
                          criarTarefa.mutate({
                            titulo: tituloNovaTarefa.trim(),
                            secaoId: col.id === SEM_SECAO ? null : col.id,
                          });
                          setTituloNovaTarefa("");
                        }
                        if (e.key === "Escape") { setNovaTarefaEm(null); setTituloNovaTarefa(""); }
                      }}
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-muted-foreground"
                      onClick={() => setNovaTarefaEm(col.id)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar tarefa
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a seção “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir seção NÃO apaga as tarefas — elas vão para “Sem seção”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (excluindo) excluir.mutate(excluindo.id);
                setExcluindo(null);
              }}
            >
              Excluir seção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
