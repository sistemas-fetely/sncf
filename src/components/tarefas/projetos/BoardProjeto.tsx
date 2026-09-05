import { useMemo, useState } from "react";
import { CalendarClock, GripVertical, Lock, MoreHorizontal, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNomePessoa, PRIORIDADE_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import {
  useCriarSecao, useCriarTarefaNaSecao, useExcluirSecao, useMoverTarefaSecao,
  usePodeGerenciarProjeto, useRenomearSecao, useReordenarSecoes, useSecoesProjeto,
  useTarefasDoProjeto, type TarefaBoard,
} from "@/hooks/tarefas/useProjetosTarefas";
import {
  formatarValorCampo, useCamposCatalogo, useCamposDoProjeto, useValoresCamposDoBoard,
} from "@/hooks/tarefas/useProjetoCampos";
import { useNaturezasTarefa } from "@/hooks/tarefas/useTarefasCatalogos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEM_SECAO = "__sem_secao__";

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

  const { data: naturezas } = useNaturezasTarefa();
  const [naturezaFiltro, setNaturezaFiltro] = useState<string>("todas");
  const contagemPorNatureza = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const t of tarefas ?? []) {
      const cod = t.natureza ?? "operacional";
      mapa[cod] = (mapa[cod] ?? 0) + 1;
    }
    return mapa;
  }, [tarefas, naturezaFiltro]);

  const [alvo, setAlvo] = useState<string | null>(null);
  const [novaSecao, setNovaSecao] = useState("");
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const [novaTarefaEm, setNovaTarefaEm] = useState<string | null>(null);
  const [tituloNovaTarefa, setTituloNovaTarefa] = useState("");

  const colunas = useMemo(() => {
    const lista = [{ id: SEM_SECAO, nome: "Sem seção", fixa: true }];
    for (const s of secoes ?? []) lista.push({ id: s.id, nome: s.nome, fixa: false });
    return lista;
  }, [secoes]);

  /**
   * Subtarefa com o mesmo responsável da mãe é passo de checklist — vive no
   * detalhe da mãe, não como card solto. Mesma regra do banco
   * (trabalho_independente), calculada aqui porque o board lê a tabela.
   */
  const porResponsavelMae = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const t of tarefas ?? []) mapa.set(t.id, t.responsavel_id);
    return mapa;
  }, [tarefas]);

  const ehIndependente = useCallback(
    (t: TarefaBoard) => {
      if (!t.parent_id) return true;
      if (!porResponsavelMae.has(t.parent_id)) return true; // mãe fora do board
      return porResponsavelMae.get(t.parent_id) !== t.responsavel_id;
    },
    [porResponsavelMae]
  );

  /** progresso das subtarefas de cada mãe, para o selo compacto "3/7" */
  const progressoFilhas = useMemo(() => {
    const mapa = new Map<string, { feitas: number; total: number }>();
    for (const t of tarefas ?? []) {
      if (!t.parent_id) continue;
      const atual = mapa.get(t.parent_id) ?? { feitas: 0, total: 0 };
      atual.total += 1;
      if (t.status === "concluida") atual.feitas += 1;
      mapa.set(t.parent_id, atual);
    }
    return mapa;
  }, [tarefas]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, TarefaBoard[]>();
    const visiveis = (tarefas ?? []).filter(
      (t) =>
        ehIndependente(t) &&
        (naturezaFiltro === "todas" || (t.natureza ?? "operacional") === naturezaFiltro)
    );
    for (const t of visiveis) {
      const chave = t.secao_id ?? SEM_SECAO;
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    return mapa;
  }, [tarefas, naturezaFiltro, ehIndependente]);

  function podeArrastar(t: TarefaBoard): boolean {
    return !!podeGerenciar || t.responsavel_id === user?.id || t.criado_por === user?.id;
  }

  function soltar(colunaId: string, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    const tarefaId = e.dataTransfer.getData("text/tarefa-id");
    if (!tarefaId) return;
    const atual = (tarefas ?? []).find((t) => t.id === tarefaId);
    if (!atual) return;
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
        <Select value={naturezaFiltro} onValueChange={setNaturezaFiltro}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Natureza" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as naturezas ({(tarefas ?? []).length})</SelectItem>
            {(naturezas ?? []).map((n) => (
              <SelectItem key={n.codigo} value={n.codigo}>
                {n.nome} ({contagemPorNatureza[n.codigo] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
                          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.titulo}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-[10px]", PRIORIDADE_CLASSE[t.prioridade])}>
                            {PRIORIDADE_ROTULO[t.prioridade]}
                          </Badge>
                          {limite && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CalendarClock className="h-3 w-3" /> {limite}
                            </span>
                          )}
                          {t.responsavel_id && (
                            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                              {iniciais(nomePessoa(t.responsavel_id))}
                            </span>
                          )}
                        </div>

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
