import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MessageCircle,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  ArrowUpRight,
  Undo2,
  History,
  Tags,
  MoreHorizontal,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ESTAGIO_SELO } from "@/components/pedidos/BadgesPedido";
import KpiPill from "@/pages/administrativo/CaixaBanco/KpiPill";
import type { EstagioPedido } from "@/types/pedido";
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";
import {
  SOLICITACAO_TIPO_ROTULO,
  useAtenderSolicitacao,
  useContagemSolicitacoesPorStatus,
  useDescartarSolicitacao,
  useSolicitacoesPorStatus,
  type SolicitacaoComercial,
  type SolicitacaoStatus,
} from "@/hooks/pedidos/useSolicitacoesComercial";

/**
 * Central de Mensagens — fila de trabalho do SOPS.
 *
 * A AÇÃO MORA ONDE O OBJETO MORA: a fila lê `solicitacao_comercial`, que tem
 * ciclo de vida (`aberta`/`atendida`/`cancelada`), e nunca `pedido_eventos`,
 * que é log imutável de timeline.
 *
 * RESPONDER NÃO CONCLUI: responder registra `msg_sops` no pedido; concluir é
 * `atender_solicitacao_comercial` e agora exige MOTIVO — é o motivo que diz por
 * que o solicitante não resolveu sozinho, e é ele que gera o roadmap.
 *
 * MODO-LEITURA-NAO-ESCONDE-DADO: sem `pode_editar` a tela mostra tudo; o que
 * desaparece é o poder de mudar. Trilha continua liberada — é leitura.
 */

const DATA_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
function fmtData(d: string) {
  try { return DATA_FMT.format(new Date(d)); } catch { return d; }
}
function dataHora(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

const ESTAGIO_LABELS: Record<string, string> = {
  recebido:             "Recebido",
  em_analise_credito:   "Em análise",
  cobranca:             "Cobrança",
  aguardando_pagamento: "Aguardando PG",
  aguardando_estoque:   "Ag. estoque",
  pre_separacao:        "Pré-Separação",
  pre_faturamento:      "Pré-Faturamento",
  em_separacao:         "Em separação",
  faturado:             "Faturado",
  em_transporte:        "Em transporte",
  entregue:             "Entregue",
};

const VAZIO: Record<SolicitacaoStatus, string> = {
  aberta: "Nenhuma solicitação aberta.",
  atendida: "Nenhuma solicitação concluída.",
  cancelada: "Nenhuma solicitação descartada.",
};

const CAMADA_ROTULO: Record<string, string> = {
  C0: "Autoatendimento",
  C1: "Atendimento",
  C2: "Cadeira dona",
  C3: "Sistema",
};

const EVENTO_ROTULO: Record<string, string> = {
  aberta: "Aberta",
  classificada: "Classificada",
  escalada: "Escalada",
  devolvida: "Devolvida",
  atendida: "Atendida",
  descartada: "Descartada",
};

const EVENTO_CLASSE: Record<string, string> = {
  escalada: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  devolvida: "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  atendida: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  descartada: "border-border bg-muted text-muted-foreground",
};

const CADEIRA_ENTRADA = "Atendimento ao Cliente";
const SEM_EDICAO = "Você tem acesso somente leitura nesta tela";

interface FilaExtra {
  solicitacao_id: string;
  assunto_codigo: string | null;
  assunto: string | null;
  prazo_dias: number | null;
  cadeira: string | null;
  cadeira_atual_id: string | null;
  camada: string | null;
  em_triagem: boolean | null;
  vencida: boolean | null;
  dias_aberta: number | null;
}

interface Assunto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
}

interface Motivo {
  id: string;
  codigo: string;
  nome: string;
  remedio: string | null;
}

interface CadeiraDestino {
  cadeira_id: string;
  cadeira: string;
  atende: string | null;
  responde: string | null;
  ordem: number | null;
}

interface PassoTrilha {
  solicitacao_id: string;
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
  fila: ["vw_fila_solicitacoes_comercial"] as const,
  assuntos: ["demanda_assunto", "canal-cpo"] as const,
  motivos: ["demanda_motivo", "canal-cpo"] as const,
  cadeiras: ["vw_cadeira_atendimento", "canal-cpo"] as const,
  trilha: (id: string) => ["vw_solicitacao_trilha", id] as const,
};

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

export default function CanalCPO() {
  return (
    <PermissaoTelaProvider slug="tela.canal_cpo">
      <CanalCPOConteudo />
    </PermissaoTelaProvider>
  );
}

function CanalCPOConteudo() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { podeEditar } = usePermissaoTelaContext();

  const [status, setStatus] = useState<SolicitacaoStatus>("aberta");

  const [concluir, setConcluir] = useState<SolicitacaoComercial | null>(null);
  const [nota, setNota] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState("");

  const [descartar, setDescartar] = useState<SolicitacaoComercial | null>(null);
  const [motivo, setMotivo] = useState("");

  const [classificando, setClassificando] = useState<SolicitacaoComercial | null>(null);
  const [assuntoId, setAssuntoId] = useState("");

  const [escalando, setEscalando] = useState<SolicitacaoComercial | null>(null);
  const [cadeiraDestino, setCadeiraDestino] = useState("");
  const [motivoEscalar, setMotivoEscalar] = useState("");

  const [devolvendo, setDevolvendo] = useState<SolicitacaoComercial | null>(null);
  const [comoResolver, setComoResolver] = useState("");

  const [trilhaDe, setTrilhaDe] = useState<SolicitacaoComercial | null>(null);

  const { data: lista = [], isLoading, isError: listaErro, error: listaErroObj } =
    useSolicitacoesPorStatus(status);
  const { data: contagens } = useContagemSolicitacoesPorStatus();
  const atender = useAtenderSolicitacao();
  const descartarMut = useDescartarSolicitacao();

  const fila = useQuery({
    queryKey: QK.fila,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<FilaExtra[]> => {
      const { data, error } = await supabase
        .from("vw_fila_solicitacoes_comercial")
        .select(
          "solicitacao_id, assunto_codigo, assunto, prazo_dias, cadeira, cadeira_atual_id, camada, em_triagem, vencida, dias_aberta",
        );
      if (error) throw error;
      return (data ?? []) as FilaExtra[];
    },
  });

  const assuntos = useQuery({
    queryKey: QK.assuntos,
    queryFn: async (): Promise<Assunto[]> => {
      const { data, error } = await supabase
        .from("demanda_assunto")
        .select("id, codigo, nome, descricao")
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

  const cadeiras = useQuery({
    queryKey: QK.cadeiras,
    queryFn: async (): Promise<CadeiraDestino[]> => {
      const { data, error } = await supabase
        .from("vw_cadeira_atendimento")
        .select("cadeira_id, cadeira, atende, responde, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CadeiraDestino[];
    },
  });

  const trilha = useQuery({
    queryKey: QK.trilha(trilhaDe?.id ?? ""),
    enabled: !!trilhaDe,
    queryFn: async (): Promise<PassoTrilha[]> => {
      const { data, error } = await supabase
        .from("vw_solicitacao_trilha")
        .select("*")
        .eq("solicitacao_id", trilhaDe!.id)
        .order("passo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PassoTrilha[];
    },
  });

  const extraPor = new Map<string, FilaExtra>();
  (fila.data ?? []).forEach((f) => extraPor.set(f.solicitacao_id, f));

  function invalidarTela(solicitacaoId?: string) {
    void qc.invalidateQueries({ queryKey: ["solicitacoes-por-status"] });
    void qc.invalidateQueries({ queryKey: ["solicitacoes-contagem-status"] });
    void qc.invalidateQueries({ queryKey: ["solicitacoes-abertas"] });
    void qc.invalidateQueries({ queryKey: ["solicitacoes-abertas-contagem"] });
    void qc.invalidateQueries({ queryKey: QK.fila });
    if (solicitacaoId) void qc.invalidateQueries({ queryKey: QK.trilha(solicitacaoId) });
  }

  /**
   * Classificar não tem RPC dedicada: escrevemos `assunto_id` e um trigger do
   * banco registra a trilha. Por isso NÃO gravamos histórico aqui.
   */
  const classificar = useMutation({
    mutationFn: async () => {
      const id = classificando!.id;
      const { error } = await supabase
        .from("solicitacao_comercial")
        .update({ assunto_id: assuntoId })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      toast.success("Assunto definido.");
      setClassificando(null);
      setAssuntoId("");
      invalidarTela(id);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const escalar = useMutation({
    mutationFn: async () => {
      const id = escalando!.id;
      const { data, error } = await supabase.rpc("escalar_solicitacao", {
        p_solicitacao_id: id,
        p_cadeira_destino: cadeiraDestino,
        p_motivo_texto: motivoEscalar.trim(),
      });
      if (error) throw error;
      return {
        id,
        r: data as unknown as { cadeira?: string | null; camada?: string | null },
      };
    },
    onSuccess: ({ id, r }) => {
      const destino = r?.cadeira ?? cadeiraDestino;
      toast.success(
        `Escalada para ${destino}${r?.camada ? ` · camada ${r.camada}` : ""}`,
      );
      setEscalando(null);
      setCadeiraDestino("");
      setMotivoEscalar("");
      invalidarTela(id);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const devolver = useMutation({
    mutationFn: async () => {
      const id = devolvendo!.id;
      const { data, error } = await supabase.rpc("devolver_solicitacao", {
        p_solicitacao_id: id,
        p_motivo_texto: comoResolver.trim(),
      });
      if (error) throw error;
      return { id, r: data as unknown as { devolvida_para?: string | null } };
    },
    onSuccess: ({ id, r }) => {
      toast.success(
        `Devolvida para ${r?.devolvida_para ?? CADEIRA_ENTRADA}`,
      );
      setDevolvendo(null);
      setComoResolver("");
      invalidarTela(id);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const motivoEscolhido = motivos.data?.find((m) => m.codigo === motivoCodigo) ?? null;

  return (
    <PageShell>
      <PageHeader
        titulo="Central de Mensagens"
        icone={MessageCircle}
        estado="Solicitações do comercial ao SOPS · concluir, escalar e devolver ficam na trilha"
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      <div className="flex flex-wrap gap-2">
        <KpiPill
          label="Abertas"
          count={contagens?.aberta ?? 0}
          color="blue"
          active={status === "aberta"}
          onClick={() => setStatus("aberta")}
        />
        <KpiPill
          label="Concluídas"
          count={contagens?.atendida ?? 0}
          color="emerald"
          active={status === "atendida"}
          onClick={() => setStatus("atendida")}
        />
        <KpiPill
          label="Descartadas"
          count={contagens?.cancelada ?? 0}
          color="gray"
          active={status === "cancelada"}
          onClick={() => setStatus("cancelada")}
        />
      </div>

      {fila.isError && <ErroQuery o_que="assunto, cadeira e prazo da fila" erro={fila.error} />}
      {assuntos.isError && <ErroQuery o_que="a lista de assuntos" erro={assuntos.error} />}
      {motivos.isError && <ErroQuery o_que="a lista de motivos" erro={motivos.error} />}
      {cadeiras.isError && <ErroQuery o_que="as cadeiras de destino" erro={cadeiras.error} />}

      {listaErro ? (
        <ErroQuery o_que="a fila de solicitações" erro={listaErroObj} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>{VAZIO[status]}</p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-2">
            {lista.map((s) => {
              const ex = extraPor.get(s.id);
              const emTriagem = ex?.em_triagem === true;
              const vencida = ex?.vencida === true;
              const podeDevolver = !!ex?.cadeira && ex.cadeira !== CADEIRA_ENTRADA;
              return (
                <div
                  key={s.id}
                  className={`flex items-start justify-between gap-4 p-4 rounded-lg border bg-card transition-colors ${
                    vencida ? "border-destructive/60 bg-destructive/5" : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/pedidos/${s.pedido_id}`)}
                        className="font-mono text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
                      >
                        {s.pedido_id_externo || s.pedido_id.slice(0, 8).toUpperCase()}
                      </button>
                      {s.pedido_estagio && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            ESTAGIO_SELO[s.pedido_estagio as EstagioPedido] ??
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ESTAGIO_LABELS[s.pedido_estagio] ?? s.pedido_estagio}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-info">
                        {SOLICITACAO_TIPO_ROTULO[s.tipo] ?? s.tipo}
                      </span>

                      {emTriagem ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          sem assunto
                        </Badge>
                      ) : ex?.assunto ? (
                        <Badge variant="outline" className="text-[10px]">
                          {ex.assunto}
                        </Badge>
                      ) : null}

                      {ex?.camada && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="text-[10px]">
                              {ex.camada}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {CAMADA_ROTULO[ex.camada] ?? ex.camada}
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {vencida && (
                        <Badge variant="destructive" className="text-[10px]">
                          Atrasada · {ex?.dias_aberta ?? 0} dia(s) aberta
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.cliente_razao || "—"}
                      {ex?.cadeira ? ` · → ${ex.cadeira}` : ""}
                    </div>
                    <div className="text-sm mt-2 whitespace-pre-wrap break-words">
                      {s.detalhe || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Aberta por {s.criado_por_nome || "—"} · {fmtData(s.criado_em)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!podeEditar}
                      title={podeEditar ? undefined : SEM_EDICAO}
                      onClick={() => navigate(`/pedidos/${s.pedido_id}`)}
                    >
                      Responder <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>

                    {s.status === "aberta" && (
                      <Button
                        size="sm"
                        disabled={!podeEditar}
                        title={podeEditar ? undefined : SEM_EDICAO}
                        onClick={() => {
                          setConcluir(s);
                          setNota("");
                          setMotivoCodigo("");
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" /> Concluir
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status === "aberta" && emTriagem && (
                          <DropdownMenuItem
                            disabled={!podeEditar}
                            title={podeEditar ? undefined : SEM_EDICAO}
                            onClick={() => {
                              setClassificando(s);
                              setAssuntoId("");
                            }}
                          >
                            <Tags className="h-4 w-4 mr-2" /> Classificar
                          </DropdownMenuItem>
                        )}
                        {s.status === "aberta" && (
                          <DropdownMenuItem
                            disabled={!podeEditar}
                            title={podeEditar ? undefined : SEM_EDICAO}
                            onClick={() => {
                              setEscalando(s);
                              setCadeiraDestino("");
                              setMotivoEscalar("");
                            }}
                          >
                            <ArrowUpRight className="h-4 w-4 mr-2" /> Escalar
                          </DropdownMenuItem>
                        )}
                        {s.status === "aberta" && podeDevolver && (
                          <DropdownMenuItem
                            disabled={!podeEditar}
                            title={podeEditar ? undefined : SEM_EDICAO}
                            onClick={() => {
                              setDevolvendo(s);
                              setComoResolver("");
                            }}
                          >
                            <Undo2 className="h-4 w-4 mr-2" /> Devolver
                          </DropdownMenuItem>
                        )}
                        {s.status === "aberta" && (
                          <DropdownMenuItem
                            disabled={!podeEditar}
                            title={podeEditar ? undefined : SEM_EDICAO}
                            className="text-destructive"
                            onClick={() => {
                              setDescartar(s);
                              setMotivo("");
                            }}
                          >
                            <X className="h-4 w-4 mr-2" /> Descartar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setTrilhaDe(s)}>
                          <History className="h-4 w-4 mr-2" /> Trilha
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {/* Concluir — nota opcional, MOTIVO obrigatório */}
      <Dialog open={!!concluir} onOpenChange={(o) => !o && setConcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir solicitação</DialogTitle>
            <DialogDescription>
              {concluir
                ? `${SOLICITACAO_TIPO_ROTULO[concluir.tipo] ?? concluir.tipo} · pedido ${
                    concluir.pedido_id_externo ?? ""
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Nota de atendimento (opcional)
              </label>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Motivo (obrigatório)</label>
              <Select value={motivoCodigo} onValueChange={setMotivoCodigo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {(motivos.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.codigo}>
                      <span className="flex flex-col text-left">
                        <span>{m.nome}</span>
                        {m.remedio && (
                          <span className="text-xs text-muted-foreground">{m.remedio}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O motivo responde por que o solicitante não resolveu sozinho — é ele que
                gera o roadmap.
                {motivoEscolhido?.remedio ? ` Remédio: ${motivoEscolhido.remedio}` : ""}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConcluir(null)}>
              Cancelar
            </Button>
            <Button
              disabled={atender.isPending || !motivoCodigo}
              onClick={async () => {
                if (!concluir) return;
                if (!motivoCodigo) return void toast.error("Escolha o motivo.");
                try {
                  await atender.mutateAsync({
                    solicitacaoId: concluir.id,
                    nota: nota.trim() || null,
                    motivoCodigo,
                  });
                  invalidarTela(concluir.id);
                  setConcluir(null);
                } catch {
                  /* toast já exibido pelo hook */
                }
              }}
            >
              {atender.isPending ? "Salvando..." : "Concluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classificar */}
      <Dialog open={!!classificando} onOpenChange={(o) => !o && setClassificando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classificar solicitação</DialogTitle>
            <DialogDescription>
              Sem assunto a solicitação fica em triagem e não tem prazo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Assunto (obrigatório)</label>
            <Select value={assuntoId} onValueChange={setAssuntoId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o assunto" />
              </SelectTrigger>
              <SelectContent>
                {(assuntos.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex flex-col text-left">
                      <span>{a.nome}</span>
                      {a.descricao && (
                        <span className="text-xs text-muted-foreground">{a.descricao}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClassificando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={classificar.isPending || !assuntoId}
              onClick={() => {
                if (!assuntoId) return void toast.error("Escolha o assunto.");
                classificar.mutate();
              }}
            >
              {classificar.isPending ? "Salvando..." : "Classificar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalar */}
      <Dialog open={!!escalando} onOpenChange={(o) => !o && setEscalando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalar solicitação</DialogTitle>
            <DialogDescription>
              Escalar sobe a camada e fica registrado na trilha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Cadeira de destino (obrigatório)
              </label>
              <Select value={cadeiraDestino} onValueChange={setCadeiraDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a cadeira" />
                </SelectTrigger>
                <SelectContent>
                  {(cadeiras.data ?? [])
                    .filter(
                      (c) =>
                        c.cadeira !==
                        (escalando ? extraPor.get(escalando.id)?.cadeira ?? null : null),
                    )
                    .map((c) => (
                      <SelectItem key={c.cadeira_id} value={c.cadeira}>
                        <span className="flex flex-col text-left">
                          <span>{c.cadeira}</span>
                          {c.atende && (
                            <span className="text-xs text-muted-foreground">
                              Atende: {c.atende}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Por que está escalando (obrigatório)
              </label>
              <Textarea
                rows={3}
                value={motivoEscalar}
                onChange={(e) => setMotivoEscalar(e.target.value)}
                placeholder="O que você tentou e por que precisa de outra cadeira"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={escalar.isPending || !cadeiraDestino || !motivoEscalar.trim()}
              onClick={() => {
                if (!cadeiraDestino) return void toast.error("Escolha a cadeira de destino.");
                if (!motivoEscalar.trim()) return void toast.error("Explique por que está escalando.");
                escalar.mutate();
              }}
            >
              {escalar.isPending ? "Salvando..." : "Escalar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Devolver */}
      <Dialog open={!!devolvendo} onOpenChange={(o) => !o && setDevolvendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver para a entrada</DialogTitle>
            <DialogDescription>
              A instrução é o que fecha a lacuna de autoatendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Como resolver (obrigatório)</label>
            <Textarea
              rows={4}
              value={comoResolver}
              onChange={(e) => setComoResolver(e.target.value)}
              placeholder="Explique o passo a passo para quem vai resolver na entrada"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDevolvendo(null)}>
              Cancelar
            </Button>
            <Button
              disabled={devolver.isPending || !comoResolver.trim()}
              onClick={() => {
                if (!comoResolver.trim()) return void toast.error("Escreva como resolver.");
                devolver.mutate();
              }}
            >
              {devolver.isPending ? "Salvando..." : "Devolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Descartar — motivo OBRIGATÓRIO */}
      <Dialog open={!!descartar} onOpenChange={(o) => !o && setDescartar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar solicitação</DialogTitle>
            <DialogDescription>
              {descartar
                ? `${SOLICITACAO_TIPO_ROTULO[descartar.tipo] ?? descartar.tipo} · pedido ${
                    descartar.pedido_id_externo ?? ""
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Motivo (obrigatório)</label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDescartar(null)}>
              Cancelar
            </Button>
            <Button
              disabled={descartarMut.isPending || !motivo.trim()}
              onClick={async () => {
                if (!descartar || !motivo.trim()) return;
                try {
                  await descartarMut.mutateAsync({
                    solicitacaoId: descartar.id,
                    motivo: motivo.trim(),
                  });
                  invalidarTela(descartar.id);
                  setDescartar(null);
                } catch {
                  /* toast já exibido pelo hook */
                }
              }}
            >
              {descartarMut.isPending ? "Salvando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trilha */}
      <Dialog open={!!trilhaDe} onOpenChange={(o) => !o && setTrilhaDe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Trilha da solicitação</DialogTitle>
            <DialogDescription>
              {trilhaDe?.pedido_id_externo
                ? `Pedido ${trilhaDe.pedido_id_externo}`
                : "Histórico de passos"}
            </DialogDescription>
          </DialogHeader>

          {trilha.isError ? (
            <ErroQuery o_que="a trilha" erro={trilha.error} />
          ) : trilha.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (trilha.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum passo registrado.</p>
          ) : (
            <ol className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {(trilha.data ?? []).map((p, i) => {
                const ev = p.evento ?? "";
                const mostraCadeiras =
                  !!p.cadeira_de && !!p.cadeira_para && p.cadeira_de !== p.cadeira_para;
                return (
                  <li
                    key={`${p.passo ?? i}-${ev}`}
                    className="border-l-2 border-border pl-3 space-y-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${EVENTO_CLASSE[ev] ?? ""}`}
                      >
                        {EVENTO_ROTULO[ev] ?? ev || "—"}
                      </Badge>
                      {mostraCadeiras && (
                        <span className="text-xs text-muted-foreground">
                          {p.cadeira_de} → {p.cadeira_para}
                        </span>
                      )}
                      {p.camada_para && (
                        <span className="text-xs text-muted-foreground">
                          camada {p.camada_para}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.ator || "—"} · {dataHora(p.criado_em)}
                    </div>
                    {p.motivo_texto && (
                      <p className="text-sm rounded-md bg-muted/50 px-2 py-1 whitespace-pre-wrap break-words">
                        {p.motivo_texto}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTrilhaDe(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
