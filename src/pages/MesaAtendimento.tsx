import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Headphones,
  Plus,
  AlertTriangle,
  Inbox,
  ArrowUpRight,
  Undo2,
  History,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Mesa de Atendimento — registra demanda que chegou por FORA do sistema
 * (WhatsApp, Instagram, telefone, e-mail) e trabalha a fila do que está aberto.
 *
 * O solicitante pode ser cliente final sem login: nome e contato são texto
 * livre de propósito. Nada é gravado direto em tabela — só via as RPCs
 * `abrir_demanda` e `atender_demanda`.
 */

const ENTIDADE_TIPOS = [
  { valor: "nenhuma", rotulo: "Nenhuma" },
  { valor: "pedido", rotulo: "Pedido" },
  { valor: "parceiro", rotulo: "Parceiro" },
  { valor: "titulo", rotulo: "Título" },
  { valor: "produto", rotulo: "Produto" },
  { valor: "pessoa", rotulo: "Pessoa" },
];

interface Canal {
  codigo: string;
  nome: string;
  natureza: string | null;
  exige_solicitante_externo: boolean | null;
}

interface Assunto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  prazo_dias: number | null;
}

interface Motivo {
  id: string;
  codigo: string;
  nome: string;
  remedio: string | null;
}

interface DemandaAberta {
  demanda_id: string;
  codigo: string | null;
  status: string | null;
  camada: string | null;
  canal: string | null;
  canal_natureza: string | null;
  assunto_codigo: string | null;
  assunto: string | null;
  cadeira: string | null;
  entidade_tipo: string | null;
  entidade_ref: string | null;
  entidade_id: string | null;
  pedido_id_externo: string | null;
  solicitante_nome: string | null;
  solicitante_contato: string | null;
  descricao: string | null;
  criado_em: string | null;
  dias_aberta: number | null;
  vencida: boolean | null;
  em_triagem: boolean | null;
}

interface CargaCadeira {
  cadeira: string | null;
  cadeira_id: string | null;
  abertas_total: number | null;
  aguardando: number | null;
  em_atendimento: number | null;
  escaladas: number | null;
  em_triagem: number | null;
  vencidas: number | null;
  mais_antiga: string | null;
}

interface CadeiraDestino {
  cadeira_id: string;
  cadeira: string;
  dono_role: string | null;
  responde: string | null;
  atende: string | null;
  ordem: number | null;
}

interface PassoTrilha {
  demanda_id: string;
  codigo: string | null;
  evento: string | null;
  cadeira_de: string | null;
  cadeira_para: string | null;
  status_de: string | null;
  status_para: string | null;
  camada_de: string | null;
  camada_para: string | null;
  motivo_texto: string | null;
  ator: string | null;
  criado_em: string | null;
  passo: number | null;
}

const QK = {
  canais: ["demanda_canal"] as const,
  assuntos: ["demanda_assunto"] as const,
  motivos: ["demanda_motivo"] as const,
  fila: ["vw_demanda_aberta"] as const,
  carga: ["vw_demanda_carga_cadeira"] as const,
  cadeiras: ["vw_cadeira_atendimento"] as const,
  trilha: (id: string) => ["vw_demanda_trilha", id] as const,
};

const EVENTO_ROTULO: Record<string, string> = {
  aberta: "Aberta",
  classificada: "Classificada",
  assumida: "Assumida",
  escalada: "Escalada",
  devolvida: "Devolvida",
  resolvida: "Resolvida",
  descartada: "Descartada",
  reaberta: "Reaberta",
};

/** escalada/devolvida em âmbar, resolvida em verde, descartada em cinza, resto neutro */
const EVENTO_CLASSE: Record<string, string> = {
  escalada: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  devolvida: "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  resolvida: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  descartada: "border-border bg-muted text-muted-foreground",
};

const CAMADA_ROTULO: Record<string, string> = {
  C0: "Autoatendimento",
  C1: "Atendimento",
  C2: "Cadeira dona",
  C3: "Sistema",
};

function dataHora(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function ErroQuery({ o_que, erro }: { o_que: string; erro: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        Não foi possível carregar {o_que}. {formatError(erro)}
      </AlertDescription>
    </Alert>
  );
}

export default function MesaAtendimento() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── filtros da fila
  const [fCadeira, setFCadeira] = useState("todas");
  const [fCanal, setFCanal] = useState("todos");
  const [soVencidas, setSoVencidas] = useState(false);

  // ── registrar
  const [abrirAberto, setAbrirAberto] = useState(false);
  const [canal, setCanal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [assunto, setAssunto] = useState("sem");
  const [entTipo, setEntTipo] = useState("nenhuma");
  const [entRef, setEntRef] = useState("");
  const [solNome, setSolNome] = useState("");
  const [solContato, setSolContato] = useState("");

  // ── atender
  const [atendendo, setAtendendo] = useState<DemandaAberta | null>(null);
  const [resolucao, setResolucao] = useState("");
  const [motivo, setMotivo] = useState("");

  // ── escalar / devolver / trilha
  const [escalando, setEscalando] = useState<DemandaAberta | null>(null);
  const [cadeiraDestino, setCadeiraDestino] = useState("");
  const [motivoEscalar, setMotivoEscalar] = useState("");
  const [devolvendo, setDevolvendo] = useState<DemandaAberta | null>(null);
  const [comoResolver, setComoResolver] = useState("");
  const [demandaSelecionada, setDemandaSelecionada] = useState<DemandaAberta | null>(null);


  const canais = useQuery({
    queryKey: QK.canais,
    queryFn: async (): Promise<Canal[]> => {
      const { data, error } = await supabase
        .from("demanda_canal")
        .select("codigo, nome, natureza, exige_solicitante_externo")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Canal[];
    },
  });

  const assuntos = useQuery({
    queryKey: QK.assuntos,
    queryFn: async (): Promise<Assunto[]> => {
      const { data, error } = await supabase
        .from("demanda_assunto")
        .select("id, codigo, nome, descricao, prazo_dias")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Assunto[];
    },
  });

  const motivos = useQuery({
    queryKey: QK.motivos,
    queryFn: async (): Promise<Motivo[]> => {
      const { data, error } = await supabase
        .from("demanda_motivo")
        .select("id, codigo, nome, remedio")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Motivo[];
    },
  });

  const carga = useQuery({
    queryKey: QK.carga,
    queryFn: async (): Promise<CargaCadeira[]> => {
      const { data, error } = await supabase
        .from("vw_demanda_carga_cadeira")
        .select("*")
        .order("abertas_total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CargaCadeira[];
    },
  });

  const fila = useQuery({
    queryKey: QK.fila,
    queryFn: async (): Promise<DemandaAberta[]> => {
      const { data, error } = await supabase
        .from("vw_demanda_aberta")
        .select("*")
        .order("vencida", { ascending: false })
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DemandaAberta[];
    },
  });

  const cadeiras = useQuery({
    queryKey: QK.cadeiras,
    queryFn: async (): Promise<CadeiraDestino[]> => {
      const { data, error } = await supabase
        .from("vw_cadeira_atendimento")
        .select("cadeira_id, cadeira, dono_role, responde, atende, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CadeiraDestino[];
    },
  });

  const trilha = useQuery({
    queryKey: QK.trilha(demandaSelecionada?.demanda_id ?? ""),
    enabled: !!demandaSelecionada,
    queryFn: async (): Promise<PassoTrilha[]> => {
      const { data, error } = await supabase
        .from("vw_demanda_trilha")
        .select("*")
        .eq("demanda_id", demandaSelecionada!.demanda_id)
        .order("passo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PassoTrilha[];
    },
  });

  function invalidarTela(demandaId?: string) {
    void qc.invalidateQueries({ queryKey: QK.fila });
    void qc.invalidateQueries({ queryKey: QK.carga });
    if (demandaId) void qc.invalidateQueries({ queryKey: QK.trilha(demandaId) });
  }


  const canalSelecionado = canais.data?.find((c) => c.codigo === canal) ?? null;
  const exigeSolicitante = canalSelecionado?.exige_solicitante_externo === true;

  const abrir = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("abrir_demanda", {
        p_canal: canal,
        p_descricao: descricao.trim(),
        p_assunto_codigo: assunto === "sem" ? null : assunto,
        p_entidade_tipo: entTipo === "nenhuma" ? null : entTipo,
        p_entidade_ref: entRef.trim() || null,
        p_entidade_id: null,
        p_solicitante_nome: solNome.trim() || null,
        p_solicitante_contato: solContato.trim() || null,
      });
      if (error) throw error;
      return data as unknown as {
        ok: boolean;
        codigo: string;
        em_triagem: boolean;
        entidade_resolvida: boolean;
        cadeira: string | null;
      };
    },
    onSuccess: (r) => {
      toast.success(`${r.codigo} registrada`);
      if (r.em_triagem) {
        toast.warning("Ficou sem assunto — a demanda vai para triagem.");
      }
      if (entRef.trim() && r.entidade_resolvida === false) {
        toast.warning(
          `Referência "${entRef.trim()}" não foi encontrada — a demanda ficou solta.`,
        );
      }
      setAbrirAberto(false);
      setCanal("");
      setDescricao("");
      setAssunto("sem");
      setEntTipo("nenhuma");
      setEntRef("");
      setSolNome("");
      setSolContato("");
      invalidarTela();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const atender = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("atender_demanda", {
        p_demanda_id: atendendo!.demanda_id,
        p_resolucao: resolucao.trim(),
        p_motivo_codigo: motivo,
      });
      if (error) throw error;
      return data as unknown as { ok: boolean; codigo: string; motivo: string };
    },
    onSuccess: (r) => {
      toast.success(`${r.codigo} atendida`);
      setAtendendo(null);
      setResolucao("");
      setMotivo("");
      invalidarTela();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  function salvarDemanda() {
    if (!canal) return toast.error("Escolha o canal.");
    if (!descricao.trim()) return toast.error("Descreva a demanda.");
    if (exigeSolicitante && !solNome.trim())
      return toast.error("Este canal exige o nome do solicitante.");
    abrir.mutate();
  }

  function salvarAtendimento() {
    if (!resolucao.trim()) return toast.error("Escreva a resolução.");
    if (!motivo) return toast.error("Escolha o motivo.");
    atender.mutate();
  }

  const escalar = useMutation({
    mutationFn: async () => {
      const id = escalando!.demanda_id;
      const { data, error } = await supabase.rpc("escalar_demanda", {
        p_demanda_id: id,
        p_cadeira_destino: cadeiraDestino,
        p_motivo_texto: motivoEscalar.trim(),
      });
      if (error) throw error;
      return {
        id,
        r: data as unknown as {
          ok: boolean;
          codigo: string;
          cadeira: string;
          camada: string | null;
        },
      };
    },
    onSuccess: ({ id, r }) => {
      toast.success(`${r.codigo} escalada para ${r.cadeira}`);
      setEscalando(null);
      setCadeiraDestino("");
      setMotivoEscalar("");
      invalidarTela(id);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const devolver = useMutation({
    mutationFn: async () => {
      const id = devolvendo!.demanda_id;
      const { data, error } = await supabase.rpc("devolver_demanda", {
        p_demanda_id: id,
        p_motivo_texto: comoResolver.trim(),
      });
      if (error) throw error;
      return {
        id,
        r: data as unknown as {
          ok: boolean;
          codigo: string;
          devolvida_para: string;
        },
      };
    },
    onSuccess: ({ id, r }) => {
      toast.success(`${r.codigo} devolvida para ${r.devolvida_para}`);
      setDevolvendo(null);
      setComoResolver("");
      invalidarTela(id);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  function salvarEscalada() {
    if (!cadeiraDestino) return toast.error("Escolha a cadeira de destino.");
    if (!motivoEscalar.trim())
      return toast.error("O motivo é obrigatório e fica na trilha da demanda.");
    escalar.mutate();
  }

  function salvarDevolucao() {
    if (!comoResolver.trim())
      return toast.error("Escreva como quem recebe deve resolver.");
    devolver.mutate();
  }

  const cadeirasDestino = (cadeiras.data ?? []).filter(
    (c) => c.cadeira !== escalando?.cadeira,
  );


  const cadeirasFiltro = useMemo(
    () =>
      Array.from(
        new Set((fila.data ?? []).map((d) => d.cadeira).filter(Boolean) as string[]),
      ).sort(),
    [fila.data],
  );
  const canaisFiltro = useMemo(
    () =>
      Array.from(
        new Set((fila.data ?? []).map((d) => d.canal).filter(Boolean) as string[]),
      ).sort(),
    [fila.data],
  );

  const filaFiltrada = (fila.data ?? []).filter((d) => {
    if (fCadeira !== "todas" && d.cadeira !== fCadeira) return false;
    if (fCanal !== "todos" && d.canal !== fCanal) return false;
    if (soVencidas && d.vencida !== true) return false;
    return true;
  });

  const motivoEscolhido = motivos.data?.find((m) => m.codigo === motivo) ?? null;

  return (
    <PageShell>
      <PageHeader
        titulo="Mesa de Atendimento"
        icone={Headphones}
        estado="Demanda que chegou por fora do sistema · WhatsApp, Instagram, telefone, e-mail"
        acoes={
          <Button onClick={() => setAbrirAberto(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar demanda
          </Button>
        }
      />

      {/* ── 1. Resumo por cadeira */}
      {carga.isError ? (
        <ErroQuery o_que="o resumo por cadeira" erro={carga.error} />
      ) : carga.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (carga.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">nenhuma demanda aberta</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {carga.data!.map((c) => {
            const alerta = (c.vencidas ?? 0) > 0;
            return (
              <Card
                key={c.cadeira_id ?? c.cadeira ?? Math.random()}
                className={alerta ? "border-destructive/60 bg-destructive/5" : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {c.cadeira ?? "sem cadeira"}
                    </span>
                    {alerta && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {c.abertas_total ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.aguardando ?? 0} aguardando · {c.em_atendimento ?? 0} em atendimento ·{" "}
                    <span className={alerta ? "font-medium text-destructive" : undefined}>
                      {c.vencidas ?? 0} vencidas
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 3. Fila */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Select value={fCadeira} onValueChange={setFCadeira}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Cadeira" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as cadeiras</SelectItem>
                {cadeirasFiltro.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fCanal} onValueChange={setFCanal}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                {canaisFiltro.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={soVencidas} onCheckedChange={setSoVencidas} />
              Só vencidas
            </label>
          </div>

          {fila.isError ? (
            <ErroQuery o_que="a fila de demandas" erro={fila.error} />
          ) : fila.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (fila.data ?? []).length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Inbox className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Nenhuma demanda aberta.</p>
            </div>
          ) : filaFiltrada.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma demanda com os filtros escolhidos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Cadeira</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filaFiltrada.map((d) => (
                    <TableRow key={d.demanda_id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        <div className="flex flex-col gap-1">
                          <span>{d.codigo ?? "—"}</span>
                          {d.vencida === true && (
                            <Badge variant="destructive" className="w-fit text-[10px]">
                              Vencida
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {d.canal ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.em_triagem === true ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Sem assunto
                          </Badge>
                        ) : (
                          (d.assunto ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{d.cadeira ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div className="min-w-0">
                          <div className="truncate">{d.solicitante_nome ?? "—"}</div>
                          {d.solicitante_contato && (
                            <div className="truncate text-xs text-muted-foreground">
                              {d.solicitante_contato}
                            </div>
                          )}
                          {d.entidade_tipo === "pedido" && d.pedido_id_externo && (
                            <button
                              type="button"
                              onClick={() => navigate(`/pedidos/${d.entidade_id}`)}
                              className="mt-0.5 font-mono text-xs text-primary underline underline-offset-2 hover:no-underline"
                            >
                              {d.pedido_id_externo}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[320px] text-sm">
                        <span className="line-clamp-2 whitespace-pre-wrap break-words">
                          {d.descricao ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {d.dias_aberta ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAtendendo(d);
                              setResolucao("");
                              setMotivo("");
                            }}
                          >
                            Atender
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Ver trilha"
                            onClick={() => setDemandaSelecionada(d)}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" title="Mais ações">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEscalando(d);
                                  setCadeiraDestino("");
                                  setMotivoEscalar("");
                                }}
                              >
                                <ArrowUpRight className="mr-2 h-4 w-4" /> Escalar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDevolvendo(d);
                                  setComoResolver("");
                                }}
                              >
                                <Undo2 className="mr-2 h-4 w-4" /> Devolver
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDemandaSelecionada(d)}>
                                <History className="mr-2 h-4 w-4" /> Trilha
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Dialog registrar */}
      <Dialog open={abrirAberto} onOpenChange={setAbrirAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar demanda</DialogTitle>
            <DialogDescription>
              Demanda que chegou por fora do sistema. O solicitante pode ser cliente final
              sem login.
            </DialogDescription>
          </DialogHeader>

          {canais.isError && <ErroQuery o_que="os canais" erro={canais.error} />}
          {assuntos.isError && <ErroQuery o_que="os assuntos" erro={assuntos.error} />}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Canal <span className="text-destructive">*</span>
              </Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger>
                  <SelectValue placeholder="Como a demanda chegou" />
                </SelectTrigger>
                <SelectContent>
                  {(canais.data ?? []).map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                Descrição <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que a pessoa pediu, nas palavras dela"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Select value={assunto} onValueChange={setAssunto}>
                <SelectTrigger>
                  <SelectValue placeholder="Classificar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">Sem assunto (vai para triagem)</SelectItem>
                  {(assuntos.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.codigo}>
                      {a.nome}
                      {a.prazo_dias != null ? ` · ${a.prazo_dias}d` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assunto === "sem" && (
                <p className="text-xs text-muted-foreground">
                  Sem assunto a demanda entra em triagem e alguém precisa classificar depois.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de entidade</Label>
                <Select value={entTipo} onValueChange={setEntTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTIDADE_TIPOS.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Referência da entidade</Label>
                <Input
                  value={entRef}
                  onChange={(e) => setEntRef(e.target.value)}
                  placeholder="SHP-1234 ou PED-2057"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  Nome do solicitante
                  {exigeSolicitante && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  value={solNome}
                  onChange={(e) => setSolNome(e.target.value)}
                  placeholder="Quem pediu"
                />
                {exigeSolicitante && (
                  <p className="text-xs text-muted-foreground">
                    Este canal é de cliente externo — o nome é obrigatório.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Contato do solicitante</Label>
                <Input
                  value={solContato}
                  onChange={(e) => setSolContato(e.target.value)}
                  placeholder="Telefone, e-mail ou @"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarDemanda} disabled={abrir.isPending}>
              {abrir.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog atender */}
      <Dialog open={!!atendendo} onOpenChange={(o) => !o && setAtendendo(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atender {atendendo?.codigo ?? ""}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">
              {atendendo?.descricao ?? ""}
            </DialogDescription>
          </DialogHeader>

          {motivos.isError && <ErroQuery o_que="os motivos" erro={motivos.error} />}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Resolução <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={4}
                value={resolucao}
                onChange={(e) => setResolucao(e.target.value)}
                placeholder="O que foi feito para resolver"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Motivo <span className="text-destructive">*</span>
              </Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger>
                  <SelectValue placeholder="Por que não foi autoatendimento" />
                </SelectTrigger>
                <SelectContent>
                  {(motivos.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.codigo}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {motivoEscolhido?.remedio && (
                <p className="text-xs text-muted-foreground">
                  Remédio: {motivoEscolhido.remedio}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAtendendo(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarAtendimento} disabled={atender.isPending}>
              {atender.isPending ? "Registrando..." : "Atender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog escalar */}
      <Dialog open={!!escalando} onOpenChange={(o) => !o && setEscalando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Escalar {escalando?.codigo ?? ""}</DialogTitle>
            <DialogDescription>
              Cadeira atual: {escalando?.cadeira ?? "—"}. O motivo é obrigatório e fica
              registrado na trilha permanente da demanda.
            </DialogDescription>
          </DialogHeader>

          {cadeiras.isError && <ErroQuery o_que="as cadeiras" erro={cadeiras.error} />}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Cadeira de destino <span className="text-destructive">*</span>
              </Label>
              <Select value={cadeiraDestino} onValueChange={setCadeiraDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Quem vai receber" />
                </SelectTrigger>
                <SelectContent>
                  {cadeirasDestino.map((c) => (
                    <SelectItem key={c.cadeira_id} value={c.cadeira}>
                      <div className="flex flex-col">
                        <span>{c.cadeira}</span>
                        {c.atende && (
                          <span className="text-xs text-muted-foreground">
                            atende: {c.atende}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cadeiras.isLoading && !cadeiras.isError && cadeirasDestino.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma outra cadeira atende a mesa.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Motivo <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={4}
                value={motivoEscalar}
                onChange={(e) => setMotivoEscalar(e.target.value)}
                placeholder="Por que esta cadeira não resolve e o que a próxima precisa fazer"
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório — vai para a trilha permanente e não pode ser apagado.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEscalada} disabled={escalar.isPending}>
              {escalar.isPending ? "Escalando..." : "Escalar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog devolver */}
      <Dialog open={!!devolvendo} onOpenChange={(o) => !o && setDevolvendo(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Devolver {devolvendo?.codigo ?? ""}</DialogTitle>
            <DialogDescription>
              Volta para a cadeira de entrada (Atendimento ao Cliente) com a instrução de
              como resolver. Fica na trilha permanente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>
              Como resolver <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={5}
              value={comoResolver}
              onChange={(e) => setComoResolver(e.target.value)}
              placeholder="O passo a passo que quem recebe deve seguir para resolver"
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório — é a instrução de resolução, não uma justificativa.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolvendo(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarDevolucao} disabled={devolver.isPending}>
              {devolver.isPending ? "Devolvendo..." : "Devolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog trilha */}
      <Dialog
        open={!!demandaSelecionada}
        onOpenChange={(o) => !o && setDemandaSelecionada(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Trilha de {demandaSelecionada?.codigo ?? ""}</DialogTitle>
            <DialogDescription>
              Todo passo que a demanda deu, em ordem, com quem fez e por quê.
            </DialogDescription>
          </DialogHeader>

          {trilha.isError ? (
            <ErroQuery o_que="a trilha da demanda" erro={trilha.error} />
          ) : trilha.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (trilha.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum passo registrado nesta demanda.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {trilha.data!.map((p) => {
                const mudouCadeira =
                  !!p.cadeira_de && !!p.cadeira_para && p.cadeira_de !== p.cadeira_para;
                return (
                  <li key={`${p.passo}-${p.criado_em}`} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-border ring-4 ring-background" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${EVENTO_CLASSE[p.evento ?? ""] ?? ""}`}
                      >
                        {EVENTO_ROTULO[p.evento ?? ""] ?? p.evento ?? "—"}
                      </Badge>
                      {mudouCadeira && (
                        <span className="text-xs text-muted-foreground">
                          {p.cadeira_de} → {p.cadeira_para}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {dataHora(p.criado_em)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.ator ?? "ator não registrado"}
                    </div>
                    {p.motivo_texto && (
                      <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-sm">
                        {p.motivo_texto}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDemandaSelecionada(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
