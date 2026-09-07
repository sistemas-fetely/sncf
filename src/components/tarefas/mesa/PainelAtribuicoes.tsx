// Painel "Atribuições" — aba da Mesa do Gestor (/tarefas/mesa-gestor?aba=atribuicoes).
// Atribuições do Time — QUEM-RESPONDE-POR-QUE (tela do líder, não do admin)
//
// Eixo: PESSOA. Cargo não define responsabilidade — pessoa define.
// Fila do sistema é OPCIONAL: serve só para o volume ser MEDIDO em vez de declarado.
//
// REGRA DURA: minutos_fluxo_dia e minutos_estoque NUNCA se somam nem viram total único.
//  - fluxo   = trabalho que entra por dia   → dimensiona equipe
//  - estoque = acumulado parado na fila     → dívida operacional
//
// Escrita SEMPRE por RPC (fn_atribuicao_salvar / fn_atribuicao_apagar): a regra de
// escopo do líder, dono obrigatório e tempo > 0 vive no banco.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Info, Check, ChevronsUpDown, ExternalLink, Workflow } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { usePessoasDoTime } from "@/hooks/tarefas/useTarefasDoTime";
import { formatError } from "@/lib/format-error";

const QK = ["atribuicoes-time"] as const;
const SEM_FILA = "__sem_fila__";
const SEM_MACRO = "__sem_macro__";
const MACRO_NOVO = "__novo_macro__";

interface LinhaCarga {
  atribuicao_id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  fonte_volume: string;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  gestor_nome: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  fila_id: string | null;
  fila_nome: string | null;
  tempo_unitario_min: number | null;
  fluxo_diario_estimado: number | null;
  estoque_atual: number | null;
  minutos_fluxo_dia: number | null;
  minutos_estoque: number | null;
  furo_sem_dono: boolean | null;
  furo_dono_sem_acesso: boolean | null;
  furo_sem_numero: boolean | null;
  furo_sem_processo: boolean | null;
  macro_processo_id: string | null;
  macro_processo_nome: string | null;
  processo_id: string | null;
  processo_codigo: string | null;
  processo_nome: string | null;
  processo_tem_narrativa: boolean | null;
  processo_tem_diagrama: boolean | null;
  ativo: boolean | null;
}

interface OpcaoMacro {
  id: string;
  nome: string;
  ordem: number | null;
  cor: string | null;
}

interface OpcaoProcesso {
  id: string;
  codigo: string | null;
  nome: string;
}

interface OpcaoPessoa {
  pessoa_id: string;
  usuario_id: string | null;
  nome: string;
  cargo: string | null;
  departamento: string | null;
}

interface OpcaoFila {
  id: string;
  nome: string;
  chave: string;
}

function num(v: number | null | undefined, sufixo = "") {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return sufixo ? `${txt} ${sufixo}` : txt;
}

/** Minutos → "2h 30min". Nunca soma fluxo com estoque. */
function minutos(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export default function PainelAtribuicoes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const time = usePessoasDoTime();
  const [emEdicao, setEmEdicao] = useState<LinhaCarga | null>(null);
  const [criando, setCriando] = useState(false);
  const [aApagar, setAApagar] = useState<LinhaCarga | null>(null);
  // Nascer processo a partir da atribuição: confirmação explícita antes da RPC.
  const [aNascerProcesso, setANascerProcesso] = useState<LinhaCarga | null>(null);
  // Dois olhares sobre o mesmo catálogo: por macro processo (como se faz) ou por pessoa (quem faz).
  const [eixo, setEixo] = useState<"macro" | "pessoa">("macro");

  // Só a RPC cria o processo esqueleto (status rascunho + narrativa + primeiro passo
  // ligado à atribuição). O front não replica nada disso. FAIL-LOUD: erro vira toast.
  const nascerProcesso = useMutation({
    mutationFn: async (l: LinhaCarga): Promise<string> => {
      const { data, error } = await (supabase as any).rpc("fn_processo_nascer_de_atribuicao", {
        p_atribuicao_id: l.atribuicao_id,
        p_nome: null,
        p_codigo: null,
      });
      if (error) throw error;
      const id = (Array.isArray(data) ? data[0] : data) as string | null;
      if (!id) throw new Error("A função não devolveu o processo criado.");
      return id;
    },
    onSuccess: (processoId, l) => {
      setANascerProcesso(null);
      qc.invalidateQueries({ queryKey: QK });
      toast.success(`Processo em rascunho criado para “${l.nome}”.`, {
        description: "Um passo já foi criado ligado a esta atribuição.",
        action: {
          label: "Abrir processo",
          onClick: () => navigate(`/processos/${processoId}`),
        },
      });
    },
    onError: (e) => toast.error(formatError(e)),
  });


  const carga = useQuery({
    queryKey: [...QK, "lista"],
    queryFn: async (): Promise<LinhaCarga[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_carga_atribuicao")
        .select("*")
        .order("pessoa_nome", { ascending: true, nullsFirst: false })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaCarga[];
    },
  });

  const pessoas = useQuery({
    queryKey: [...QK, "pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OpcaoPessoa[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_gestao_pessoa")
        .select("pessoa_id, usuario_id, nome, cargo, departamento")
        .order("nome");
      if (error) throw error;
      return (data ?? [])
        .filter((p: any) => p.pessoa_id && p.nome)
        .map((p: any) => ({
          pessoa_id: p.pessoa_id as string,
          usuario_id: (p.usuario_id ?? null) as string | null,
          nome: p.nome as string,
          cargo: p.cargo ?? null,
          departamento: p.departamento ?? null,
        })) as OpcaoPessoa[];
    },
  });

  const filas = useQuery({
    queryKey: [...QK, "filas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OpcaoFila[]> => {
      const { data, error } = await (supabase as any)
        .from("tarefas_filas")
        .select("id, nome, chave")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OpcaoFila[];
    },
  });

  const macros = useQuery({
    queryKey: [...QK, "macro-processos"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OpcaoMacro[]> => {
      const { data, error } = await (supabase as any)
        .from("macro_processo")
        .select("id, nome, ordem, cor")
        .eq("ativo", true)
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OpcaoMacro[];
    },
  });

  const processos = useQuery({
    queryKey: [...QK, "processos"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OpcaoProcesso[]> => {
      const { data, error } = await (supabase as any)
        .from("processos")
        .select("id, codigo, nome")
        .order("codigo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as OpcaoProcesso[];
    },
  });

  /** Pessoas do meu time: quem reporta a mim (decidido no banco por tarefas_meu_time). */
  const pessoasDoTime = useMemo(() => {
    const idsUsuario = new Set(time.data?.ids ?? []);
    const todas = pessoas.data ?? [];
    if (idsUsuario.size === 0) return todas;
    const doTime = todas.filter((p) => p.usuario_id && idsUsuario.has(p.usuario_id));
    return doTime.length > 0 ? doTime : todas;
  }, [pessoas.data, time.data]);

  const idsTime = useMemo(
    () => new Set(pessoasDoTime.map((p) => p.pessoa_id)),
    [pessoasDoTime],
  );

  /** Lista: atribuições do time + os rascunhos sem dono (para apagar ou atribuir). */
  const linhas = useMemo(() => {
    const todas = carga.data ?? [];
    if (idsTime.size === 0) return todas;
    return todas.filter((l) => !l.pessoa_id || idsTime.has(l.pessoa_id));
  }, [carga.data, idsTime]);

  const grupos = useMemo(() => {
    const ordemMacro = new Map((macros.data ?? []).map((m) => [m.id, m.ordem ?? 999]));

    if (eixo === "pessoa") {
      const mapa = new Map<string, { nome: string; complemento: string | null; pendente: boolean; itens: LinhaCarga[] }>();
      for (const l of linhas) {
        const k = l.pessoa_id ?? "__sem_dono__";
        const atual =
          mapa.get(k) ??
          {
            nome: l.pessoa_nome ?? "Sem dono (rascunho)",
            complemento: l.gestor_nome ? `gestor: ${l.gestor_nome}` : null,
            pendente: !l.pessoa_id,
            itens: [] as LinhaCarga[],
          };
        atual.itens.push(l);
        mapa.set(k, atual);
      }
      // Sem dono primeiro: é o que pede ação.
      return [...mapa.entries()].sort(([a], [b]) =>
        a === "__sem_dono__" ? -1 : b === "__sem_dono__" ? 1 : 0,
      );
    }

    const mapa = new Map<string, { nome: string; complemento: string | null; pendente: boolean; itens: LinhaCarga[] }>();
    for (const l of linhas) {
      const k = l.macro_processo_id ?? "__sem_processo__";
      const atual =
        mapa.get(k) ??
        {
          nome: l.macro_processo_nome ?? "Sem processo",
          complemento: null,
          pendente: !l.macro_processo_id,
          itens: [] as LinhaCarga[],
        };
      atual.itens.push(l);
      mapa.set(k, atual);
    }
    return [...mapa.entries()].sort(([a, ga], [b, gb]) => {
      if (a === "__sem_processo__") return 1;
      if (b === "__sem_processo__") return -1;
      const oa = ordemMacro.get(a) ?? 999;
      const ob = ordemMacro.get(b) ?? 999;
      if (oa !== ob) return oa - ob;
      return ga.nome.localeCompare(gb.nome, "pt-BR");
    });
  }, [linhas, eixo, macros.data]);

  const totais = useMemo(
    () => ({
      total: linhas.length,
      semDono: linhas.filter((l) => l.furo_sem_dono || !l.pessoa_id).length,
      semNumero: linhas.filter((l) => l.furo_sem_numero).length,
      semProcesso: linhas.filter((l) => l.furo_sem_processo || !l.processo_id).length,
    }),
    [linhas],
  );

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("fn_atribuicao_apagar", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atribuição apagada.");
      setAApagar(null);
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error("Não apagou", { description: formatError(e) }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {carga.isLoading
            ? "carregando"
            : `${totais.total} atribuições · ${totais.semDono} sem dono · ${totais.semNumero} sem número declarado · ${totais.semProcesso} sem processo`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Agrupar por</span>
          <ToggleGroup
            type="single"
            value={eixo}
            onValueChange={(v) => v && setEixo(v as "macro" | "pessoa")}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="macro" className="text-xs">
              Macro processo
            </ToggleGroupItem>
            <ToggleGroupItem value="pessoa" className="text-xs">
              Pessoa
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Button onClick={() => setCriando(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova atribuição
        </Button>
      </div>

      <div className="space-y-1 rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Quem define é o líder da área</strong> — aqui você declara por qual trabalho cada
          pessoa do seu time responde, quanto tempo custa cada unidade e quantas entram por dia.
        </p>
        <p className="text-xs text-muted-foreground">
          Ligar a uma <strong>fila do sistema é opcional</strong> e só serve para o volume passar a
          ser medido automaticamente quando essa fila existe. Sem fila é o caso normal.
        </p>
      </div>

      {carga.isError && <p className="text-sm text-destructive">{formatError(carga.error)}</p>}

      {carga.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!carga.isLoading && linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma atribuição declarada ainda. Comece por "Nova atribuição".
        </p>
      )}

      <TooltipProvider>
        <div className="space-y-4">
          {grupos.map(([chave, grupo]) => (
            <Card key={chave}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  {grupo.nome}
                  <span className="font-normal text-muted-foreground">
                    ({grupo.itens.length})
                  </span>
                  {grupo.pendente && eixo === "pessoa" && (
                    <Selo estado="destructive">rascunho — atribua ou apague</Selo>
                  )}
                  {grupo.pendente && eixo === "macro" && (
                    <Selo estado="muted">mapeamento pendente</Selo>
                  )}
                  {grupo.complemento && (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {grupo.complemento}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {grupo.itens.map((l) => (
                    <div
                      key={l.atribuicao_id}
                      className={`flex flex-col gap-2 rounded-lg border bg-card p-3 ${
                        l.ativo === false ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{l.nome}</div>
                          {l.descricao && (
                            <div className="line-clamp-2 text-[11px] text-muted-foreground">
                              {l.descricao}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {!l.processo_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setANascerProcesso(l)}
                                  aria-label={`Criar processo para ${l.nome}`}
                                >
                                  <Workflow className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-[11px]">
                                Criar processo para este trabalho
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEmEdicao(l)}
                            aria-label={`Editar ${l.nome}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setAApagar(l)}
                            aria-label={`Apagar ${l.nome}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {l.ativo === false && <Selo estado="muted">inativa</Selo>}
                        {(l.furo_sem_dono || !l.pessoa_id) && (
                          <Selo estado="destructive">sem dono</Selo>
                        )}
                        {l.furo_dono_sem_acesso && <Selo estado="warning">dono sem acesso</Selo>}
                        {l.furo_sem_numero && <Selo estado="warning">sem número</Selo>}
                        {l.processo_id ? (
                          <Link
                            to={`/processos/${l.processo_id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                            title={l.processo_nome ?? undefined}
                          >
                            {l.processo_codigo ?? "processo"}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <Selo estado="muted">sem processo</Selo>
                        )}
                        {l.fila_nome ? (
                          <Selo estado="info">fila: {l.fila_nome}</Selo>
                        ) : (
                          <Selo estado="muted">sem fila</Selo>
                        )}
                      </div>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div>
                          <dt className="text-muted-foreground">Tempo unitário</dt>
                          <dd className="text-sm">{num(l.tempo_unitario_min, "min")}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Fluxo diário</dt>
                          <dd className="text-sm">{num(l.fluxo_diario_estimado, "/dia")}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-muted-foreground">
                            Carga por dia
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  <Info className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-[11px]">
                                Trabalho que entra por dia. Dimensiona equipe. Nunca se soma ao
                                acumulado.
                              </TooltipContent>
                            </Tooltip>
                          </dt>
                          <dd className="text-sm">{minutos(l.minutos_fluxo_dia)}</dd>
                        </div>
                        {l.fila_id ? (
                          <div>
                            <dt className="flex items-center gap-1 text-muted-foreground">
                              Acumulado na fila
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <Info className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-[11px]">
                                  Dívida operacional já parada ({num(l.estoque_atual)} itens).
                                  Medida separada, nunca somada à carga por dia.
                                </TooltipContent>
                              </Tooltip>
                            </dt>
                            <dd className="text-sm">{minutos(l.minutos_estoque)}</dd>
                          </div>
                        ) : (
                          <div>
                            <dt className="text-muted-foreground">Acumulado</dt>
                            <dd className="text-sm text-muted-foreground">não medido</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TooltipProvider>

      {(criando || emEdicao) && (
        <DialogAtribuicao
          linha={emEdicao}
          pessoas={pessoasDoTime}
          filas={filas.data ?? []}
          macros={macros.data ?? []}
          processos={processos.data ?? []}
          onFechar={() => {
            setCriando(false);
            setEmEdicao(null);
          }}
          onSalvo={() => {
            setCriando(false);
            setEmEdicao(null);
            qc.invalidateQueries({ queryKey: QK });
          }}
        />
      )}

      <AlertDialog open={!!aApagar} onOpenChange={(o) => !o && setAApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar “{aApagar?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A atribuição sai do catálogo do time. O trabalho em si e as filas não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aApagar) apagar.mutate(aApagar.atribuicao_id);
              }}
              disabled={apagar.isPending}
            >
              {apagar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------- criar / editar */

function DialogAtribuicao({
  linha,
  pessoas,
  filas,
  macros,
  processos,
  onFechar,
  onSalvo,
}: {
  linha: LinhaCarga | null;
  pessoas: OpcaoPessoa[];
  filas: OpcaoFila[];
  macros: OpcaoMacro[];
  processos: OpcaoProcesso[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(linha?.nome ?? "");
  const [descricao, setDescricao] = useState(linha?.descricao ?? "");
  const [pessoaId, setPessoaId] = useState(linha?.pessoa_id ?? "");
  const [tempo, setTempo] = useState(
    linha?.tempo_unitario_min == null ? "" : String(linha.tempo_unitario_min),
  );
  const [fluxo, setFluxo] = useState(
    linha?.fluxo_diario_estimado == null ? "" : String(linha.fluxo_diario_estimado),
  );
  const [macroId, setMacroId] = useState(linha?.macro_processo_id ?? SEM_MACRO);
  const [macroNovo, setMacroNovo] = useState("");
  const [processoId, setProcessoId] = useState<string | null>(linha?.processo_id ?? null);
  const [buscaProcessoAberta, setBuscaProcessoAberta] = useState(false);
  const [comFila, setComFila] = useState(!!linha?.fila_id);
  const [filaId, setFilaId] = useState(linha?.fila_id ?? SEM_FILA);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Dê um nome à atribuição.");
      if (!pessoaId) throw new Error("Escolha a pessoa responsável.");
      const tempoNum = Number(tempo.replace(",", "."));
      if (!Number.isFinite(tempoNum) || tempoNum <= 0) {
        throw new Error("Tempo unitário precisa ser maior que zero.");
      }
      const fluxoNum = fluxo.trim() === "" ? null : Number(fluxo.replace(",", "."));
      if (fluxoNum != null && (!Number.isFinite(fluxoNum) || fluxoNum < 0)) {
        throw new Error("Fluxo diário inválido.");
      }
      const filaEscolhida = comFila && filaId !== SEM_FILA ? filaId : null;
      if (comFila && !filaEscolhida) throw new Error("Escolha a fila ou desligue a opção.");

      // Macro processo novo nasce antes, para entrar já no parâmetro da RPC.
      let macroFinal: string | null = macroId === SEM_MACRO || macroId === MACRO_NOVO ? null : macroId;
      if (macroId === MACRO_NOVO) {
        const nomeMacro = macroNovo.trim();
        if (!nomeMacro) throw new Error("Dê um nome ao macro processo novo.");
        const { data: criado, error: errMacro } = await (supabase as any)
          .from("macro_processo")
          .insert({ nome: nomeMacro })
          .select("id")
          .single();
        if (errMacro) throw errMacro;
        macroFinal = criado.id as string;
      }

      // CAMINHO DE ESCRITA ÚNICO: fn_atribuicao_salvar agora também grava
      // macro_processo_id e processo_id. Update direto está proibido aqui.
      const { data, error } = await (supabase as any).rpc("fn_atribuicao_salvar", {
        _id: linha?.atribuicao_id ?? null,
        _nome: nome.trim(),
        _descricao: descricao.trim() === "" ? null : descricao.trim(),
        _pessoa_id: pessoaId,
        _tempo_unitario_min: tempoNum,
        _fluxo_diario: fluxoNum,
        _fonte_volume: filaEscolhida ? "fila" : "demanda_livre",
        _fila_id: filaEscolhida,
        _recorrencia_id: null,
        _departamento_id: linha?.departamento_id ?? null,
        _macro_processo_id: macroFinal,
        _processo_id: processoId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(linha ? "Atribuição atualizada." : "Atribuição criada.");
      onSalvo();
    },
    onError: (e) => toast.error("Não salvou", { description: formatError(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{linha ? "Editar atribuição" : "Nova atribuição"}</DialogTitle>
          <DialogDescription>
            Declare o trabalho, quem responde por ele e quanto custa cada unidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="atr-nome">Nome</Label>
            <Input
              id="atr-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Conferir boletos recebidos"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="atr-desc">Descrição</Label>
            <Textarea
              id="atr-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que é feito, em uma frase."
            />
          </div>

          <div className="space-y-1">
            <Label>Pessoa responsável</Label>
            <Select value={pessoaId} onValueChange={setPessoaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {pessoas.map((p) => (
                  <SelectItem key={p.pessoa_id} value={p.pessoa_id}>
                    {p.nome}
                    {p.cargo ? ` · ${p.cargo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Só pessoas do seu time. Toda atribuição tem dono.
            </p>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            <div className="space-y-1">
              <Label htmlFor="atr-tempo">Tempo unitário (min)</Label>
              <Input
                id="atr-tempo"
                inputMode="decimal"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                placeholder="Ex.: 12"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="atr-fluxo">Fluxo diário (unidades/dia)</Label>
              <Input
                id="atr-fluxo"
                inputMode="decimal"
                value={fluxo}
                onChange={(e) => setFluxo(e.target.value)}
                placeholder="Ex.: 8"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-secondary/40 p-3">
            <p className="text-[11px] text-muted-foreground">
              A atribuição diz <strong>quem faz e quanto custa</strong>. O processo diz{" "}
              <strong>como se faz</strong>. Ligar os dois é opcional, mas é o que mostra a maturidade
              do mapeamento.
            </p>

            <div className="space-y-1">
              <Label>Macro processo (opcional)</Label>
              <Select value={macroId} onValueChange={setMacroId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem macro processo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_MACRO}>Sem macro processo</SelectItem>
                  {macros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                  <SelectItem value={MACRO_NOVO}>+ Criar novo…</SelectItem>
                </SelectContent>
              </Select>
              {macroId === MACRO_NOVO && (
                <Input
                  value={macroNovo}
                  onChange={(e) => setMacroNovo(e.target.value)}
                  placeholder="Nome do macro processo novo"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                A lista nasce vazia de propósito: quem nomeia os macro processos é o líder.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Processo documentado (opcional)</Label>
              <Popover open={buscaProcessoAberta} onOpenChange={setBuscaProcessoAberta}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {processoId
                        ? (() => {
                            const p = processos.find((x) => x.id === processoId);
                            return p ? `${p.codigo ? p.codigo + " · " : ""}${p.nome}` : "processo";
                          })()
                        : "Nenhum processo ligado"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por código ou nome…" />
                    <CommandList>
                      <CommandEmpty>Nenhum processo encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="nenhum"
                          onSelect={() => {
                            setProcessoId(null);
                            setBuscaProcessoAberta(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", processoId ? "opacity-0" : "opacity-100")}
                          />
                          Nenhum processo ligado
                        </CommandItem>
                        {processos.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.codigo ?? ""} ${p.nome}`}
                            onSelect={() => {
                              setProcessoId(p.id);
                              setBuscaProcessoAberta(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                processoId === p.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">
                              {p.codigo ? `${p.codigo} · ` : ""}
                              {p.nome}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {processoId && (
                <Link
                  to={`/processos/${processoId}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Abrir o processo documentado
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="atr-fila-switch">Ligar a uma fila do sistema (opcional)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Só se existir uma fila que já conta esse volume. Ligada, o volume passa a ser
                  medido em vez de declarado. Sem fila é o caso normal.
                </p>
              </div>
              <Switch
                id="atr-fila-switch"
                checked={comFila}
                onCheckedChange={(v) => {
                  setComFila(v);
                  if (!v) setFilaId(SEM_FILA);
                }}
              />
            </div>
            {comFila && (
              <Select value={filaId} onValueChange={setFilaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a fila" />
                </SelectTrigger>
                <SelectContent>
                  {filas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {linha ? "Salvar" : "Criar atribuição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
