import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  CornerUpLeft,
  Hand,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Send,
  Tag,
  Ticket,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

/**
 * Tela do chamado — a conversa e o histórico de um chamado só.
 *
 * A tela não decide nada: quem valida permissão, move status, para o relógio do
 * SLA e escreve a trilha são as RPCs e os triggers do banco. Aqui só orquestra.
 *
 * MODO-LEITURA-NAO-ESCONDE-DADO: sem `pode_editar` a conversa e a trilha
 * continuam visíveis; o que desaparece é o poder de mudar.
 */

interface Chamado {
  chamado_id: string;
  numero: string | null;
  status: string | null;
  tipo: string | null;
  prioridade: string | null;
  camada: string | null;
  assunto: string | null;
  assunto_codigo: string | null;
  em_triagem: boolean | null;
  cadeira: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  sem_dono: boolean | null;
  solicitante: string | null;
  detalhe: string | null;
  criado_em: string | null;
  horas_corridas: number | null;
  pausado_desde: string | null;
  pausado_total_min: number | null;
  primeira_resposta_em: string | null;
  vencimento: string | null;
  vencido: boolean | null;
  pedido_id_externo: string | null;
  entidade_ref: string | null;
  motivo: string | null;
  resolvido_em: string | null;
  fechado_em: string | null;
}

interface Mensagem {
  id: string;
  direcao: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  texto: string | null;
  interna: boolean | null;
  criado_em: string | null;
}

interface Trilha {
  evento: string | null;
  cadeira_de: string | null;
  cadeira_para: string | null;
  motivo_texto: string | null;
  ator: string | null;
  criado_em: string | null;
  passo: number | null;
}

interface Assunto {
  id: string;
  codigo: string | null;
  nome: string | null;
  descricao: string | null;
}

interface Motivo {
  codigo: string;
  nome: string | null;
  remedio: string | null;
}

interface CadeiraAtendimento {
  cadeira: string | null;
  atende: string | null;
}

interface Pessoa {
  user_id: string;
  full_name: string | null;
}

const PRIORIDADE_CLASSE: Record<string, string> = {
  critica: "border-destructive/60 bg-destructive/10 text-destructive",
  alta: "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  media: "border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  baixa: "border-border bg-muted text-muted-foreground",
};

const PRIORIDADE_ROTULO: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const TIPO_ROTULO: Record<string, string> = {
  incidente: "Incidente",
  requisicao: "Requisição",
  duvida: "Dúvida",
};

const STATUS_ROTULO: Record<string, string> = {
  novo: "Novo",
  atribuido: "Atribuído",
  em_andamento: "Em andamento",
  pendente: "Pendente",
  resolvido: "Resolvido",
  fechado: "Fechado",
  cancelado: "Cancelado",
};

const CAMADA_EXPLICACAO: Record<string, string> = {
  C0: "C0 — Autoatendimento: o solicitante resolve sozinho.",
  C1: "C1 — Atendimento: a primeira linha resolve.",
  C2: "C2 — Cadeira dona: quem manda no assunto resolve.",
  C3: "C3 — Sistema: precisa de mudança no sistema.",
};

const EVENTO_ROTULO: Record<string, string> = {
  aberta: "Aberta",
  classificada: "Classificada",
  escalada: "Escalada",
  devolvida: "Devolvida",
  atendida: "Resolvida",
  descartada: "Descartada",
};

const EVENTO_CLASSE: Record<string, string> = {
  escalada: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  devolvida: "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  atendida: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  descartada: "border-border bg-muted text-muted-foreground",
};

const CADEIRA_ATENDIMENTO = "Atendimento ao Cliente";

function fmtAging(horas: number | null): string {
  if (horas == null) return "—";
  const h = Math.max(0, Math.round(horas));
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function fmtMinutos(min: number | null): string {
  if (!min) return "0min";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
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

export default function ChamadoDetalhe() {
  return (
    <PermissaoTelaProvider slug="tela.chamados">
      <ChamadoDetalheConteudo />
    </PermissaoTelaProvider>
  );
}

type AcaoTipo =
  | "pegar"
  | "pausar"
  | "retomar"
  | "passar"
  | "largar"
  | "classificar"
  | "escalar"
  | "devolver"
  | "resolver"
  | "fechar"
  | "reabrir";

const TITULO: Record<AcaoTipo, string> = {
  pegar: "Pegar chamado",
  pausar: "Pausar chamado",
  retomar: "Retomar chamado",
  passar: "Passar chamado",
  largar: "Largar chamado",
  classificar: "Classificar chamado",
  escalar: "Escalar chamado",
  devolver: "Devolver chamado",
  resolver: "Resolver chamado",
  fechar: "Confirmar fechamento",
  reabrir: "Reabrir chamado",
};

function ChamadoDetalheConteudo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { podeEditar } = usePermissaoTelaContext();

  const [acao, setAcao] = useState<AcaoTipo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState("");
  const [assuntoId, setAssuntoId] = useState("");
  const [cadeiraDestino, setCadeiraDestino] = useState("");
  const [paraUser, setParaUser] = useState("");
  const [executando, setExecutando] = useState(false);

  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const QK = useMemo(
    () => ({
      chamado: ["vw_chamado_lista", "detalhe", id] as const,
      mensagens: ["chamado_mensagem", id] as const,
      trilha: ["vw_chamado_trilha", id] as const,
      lista: ["vw_chamado_lista"] as const,
      carga: ["vw_chamado_carga_cadeira"] as const,
    }),
    [id],
  );

  const chamadoQ = useQuery({
    queryKey: QK.chamado,
    enabled: !!id,
    queryFn: async (): Promise<Chamado | null> => {
      const { data, error } = await supabase
        .from("vw_chamado_lista")
        .select("*")
        .eq("chamado_id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Chamado | null;
    },
  });

  const mensagensQ = useQuery({
    queryKey: QK.mensagens,
    enabled: !!id,
    queryFn: async (): Promise<Mensagem[]> => {
      const { data, error } = await supabase
        .from("chamado_mensagem")
        .select("id, direcao, autor_id, autor_nome, texto, interna, criado_em")
        .eq("chamado_id", id!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Mensagem[];
    },
  });

  const trilhaQ = useQuery({
    queryKey: QK.trilha,
    enabled: !!id,
    queryFn: async (): Promise<Trilha[]> => {
      const { data, error } = await supabase
        .from("vw_chamado_trilha")
        .select("evento, cadeira_de, cadeira_para, motivo_texto, ator, criado_em, passo")
        .eq("chamado_id", id!)
        .order("passo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Trilha[];
    },
  });

  const assuntosQ = useQuery({
    queryKey: ["demanda_assunto", "ativos"],
    queryFn: async (): Promise<Assunto[]> => {
      const { data, error } = await supabase
        .from("demanda_assunto")
        .select("id, codigo, nome, descricao")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Assunto[];
    },
  });

  const motivosQ = useQuery({
    queryKey: ["demanda_motivo", "ativos"],
    queryFn: async (): Promise<Motivo[]> => {
      const { data, error } = await supabase
        .from("demanda_motivo")
        .select("codigo, nome, remedio")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Motivo[];
    },
  });

  const cadeirasQ = useQuery({
    queryKey: ["vw_cadeira_atendimento"],
    queryFn: async (): Promise<CadeiraAtendimento[]> => {
      const { data, error } = await supabase
        .from("vw_cadeira_atendimento")
        .select("cadeira, atende");
      if (error) throw error;
      return (data ?? []) as unknown as CadeiraAtendimento[];
    },
  });

  const pessoasQ = useQuery({
    queryKey: ["profiles", "chamados"],
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Pessoa[];
    },
  });

  const c = chamadoQ.data ?? null;

  async function invalidar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK.chamado }),
      qc.invalidateQueries({ queryKey: QK.mensagens }),
      qc.invalidateQueries({ queryKey: QK.trilha }),
      qc.invalidateQueries({ queryKey: QK.lista }),
      qc.invalidateQueries({ queryKey: QK.carga }),
    ]);
  }

  function abrir(tipoAcao: AcaoTipo) {
    setAcao(tipoAcao);
    setMotivo("");
    setNota("");
    setMotivoCodigo("");
    setAssuntoId("");
    setCadeiraDestino("");
    setParaUser("");
  }

  function fechar() {
    setAcao(null);
  }

  async function enviarResposta() {
    if (!id || !texto.trim()) return;
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("responder_chamado", {
        p_chamado_id: id,
        p_texto: texto.trim(),
        p_interna: interna,
      });
      if (error) throw error;
      toast.success(interna ? "Nota interna registrada." : "Resposta enviada.");
      setTexto("");
      setInterna(false);
      await invalidar();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function executar() {
    if (!id || !acao) return;
    setExecutando(true);
    try {
      if (acao === "pegar") {
        const { error } = await supabase.rpc("pegar_chamado", { p_chamado_id: id });
        if (error) throw error;
        toast.success("Chamado é seu.");
      } else if (acao === "pausar") {
        const { error } = await supabase.rpc("pausar_chamado", {
          p_chamado_id: id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado pausado — relógio do SLA parado.");
      } else if (acao === "retomar") {
        const { error } = await supabase.rpc("retomar_chamado", { p_chamado_id: id });
        if (error) throw error;
        toast.success("Chamado retomado.");
      } else if (acao === "passar") {
        const { error } = await supabase.rpc("passar_chamado", {
          p_chamado_id: id,
          p_para_user_id: paraUser,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado passado.");
      } else if (acao === "largar") {
        const { error } = await supabase.rpc("largar_chamado", {
          p_chamado_id: id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado largado.");
      } else if (acao === "classificar") {
        // O trigger do banco escreve a trilha da classificação. Nada de histórico manual aqui.
        const { error } = await supabase
          .from("chamado")
          .update({ assunto_id: assuntoId })
          .eq("id", id);
        if (error) throw error;
        toast.success("Chamado classificado.");
      } else if (acao === "escalar") {
        const { error } = await supabase.rpc("escalar_solicitacao", {
          p_solicitacao_id: id,
          p_cadeira_destino: cadeiraDestino,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado escalado.");
      } else if (acao === "devolver") {
        const { error } = await supabase.rpc("devolver_solicitacao", {
          p_solicitacao_id: id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado devolvido.");
      } else if (acao === "resolver") {
        const { error } = await supabase.rpc("atender_solicitacao_comercial", {
          p_solicitacao_id: id,
          p_nota: nota.trim() || null,
          p_motivo_codigo: motivoCodigo,
        });
        if (error) throw error;
        toast.success("Chamado resolvido.");
      } else if (acao === "fechar") {
        const { error } = await supabase.rpc("fechar_chamado", { p_chamado_id: id });
        if (error) throw error;
        toast.success("Chamado fechado.");
      } else if (acao === "reabrir") {
        const { error } = await supabase.rpc("reabrir_chamado", {
          p_chamado_id: id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado reaberto.");
      }
      await invalidar();
      fechar();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setExecutando(false);
    }
  }

  const invalido =
    (acao === "pausar" && !motivo.trim()) ||
    (acao === "largar" && !motivo.trim()) ||
    (acao === "passar" && (!motivo.trim() || !paraUser)) ||
    (acao === "reabrir" && !motivo.trim()) ||
    (acao === "devolver" && !motivo.trim()) ||
    (acao === "escalar" && (!motivo.trim() || !cadeiraDestino)) ||
    (acao === "classificar" && !assuntoId) ||
    (acao === "resolver" && !motivoCodigo);

  if (chamadoQ.isError) {
    return (
      <PageShell>
        <PageHeader titulo="Chamado" icone={Ticket} />
        <ErroQuery o_que="o chamado" erro={chamadoQ.error} />
        <Button variant="outline" onClick={() => navigate("/chamados")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a Central de Chamados
        </Button>
      </PageShell>
    );
  }

  if (chamadoQ.isLoading) {
    return (
      <PageShell>
        <PageHeader titulo="Chamado" icone={Ticket} estado="Carregando chamado..." />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!c) {
    return (
      <PageShell>
        <PageHeader titulo="Chamado não encontrado" icone={Ticket} />
        <p className="text-sm text-muted-foreground">
          Este chamado não existe ou você não tem acesso a ele.
        </p>
        <Button variant="outline" onClick={() => navigate("/chamados")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a Central de Chamados
        </Button>
      </PageShell>
    );
  }

  const meu = !!user?.id && c.atribuido_a === user.id;
  const status = c.status ?? "";
  const podePegar = status === "novo" || status === "atribuido";
  const podePausar = status === "atribuido" || status === "em_andamento";
  const podeRetomar = status === "pendente";
  const emAberto = ["novo", "atribuido", "em_andamento", "pendente"].includes(status);
  const resolvido = status === "resolvido";
  const encerrado = status === "fechado" || status === "cancelado";
  const foraDoAtendimento = (c.cadeira ?? "") !== CADEIRA_ATENDIMENTO;

  const acaoBloqueada = !podeEditar;

  function BotaoAcao({
    onClick,
    children,
    variant = "outline",
  }: {
    onClick: () => void;
    children: React.ReactNode;
    variant?: "default" | "outline" | "destructive" | "secondary";
  }) {
    if (acaoBloqueada) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block">
              <Button variant={variant} className="w-full justify-start" disabled>
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Você tem acesso somente leitura nesta tela</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Button variant={variant} className="w-full justify-start" onClick={onClick}>
        {children}
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <PageShell>
        <PageHeader
          titulo="Chamado"
          icone={Ticket}
          estado={c.criado_em ? `Aberto em ${fmtDataHora(c.criado_em)}` : undefined}
          acoes={
            <Button variant="outline" onClick={() => navigate("/chamados")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
          }
        />

        {!podeEditar && <AvisoSomenteLeitura />}

        {/* HEADER do chamado */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-semibold">{c.numero ?? "—"}</span>
              <Badge variant="outline">{STATUS_ROTULO[status] ?? status ?? "—"}</Badge>
              <Badge
                variant="outline"
                className={cn(PRIORIDADE_CLASSE[c.prioridade ?? ""] ?? "")}
              >
                {PRIORIDADE_ROTULO[c.prioridade ?? ""] ?? c.prioridade ?? "—"}
              </Badge>
              <Badge variant="outline">
                {TIPO_ROTULO[c.tipo ?? ""] ?? c.tipo ?? "—"}
              </Badge>
              {c.camada && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help">
                      {c.camada}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {CAMADA_EXPLICACAO[c.camada] ?? c.camada}
                  </TooltipContent>
                </Tooltip>
              )}
              {c.vencido && (
                <Badge
                  variant="outline"
                  className="border-destructive/60 bg-destructive/10 text-destructive"
                >
                  vencido
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.assunto ? (
                <span className="text-foreground">{c.assunto}</span>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >
                  sem assunto
                </Badge>
              )}
              <span>Cadeira: {c.cadeira ?? "—"}</span>
              <span>{c.sem_dono ? "sem dono" : `Dono: ${c.atribuido_nome ?? "—"}`}</span>
              <span>Solicitante: {c.solicitante ?? "—"}</span>
              <span className="inline-flex items-center gap-1">
                Aging: {fmtAging(c.horas_corridas)}
                {c.pausado_desde && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5">
                        <Pause className="h-3.5 w-3.5" />
                        <span className="text-xs">{fmtMinutos(c.pausado_total_min)}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Relógio pausado</TooltipContent>
                  </Tooltip>
                )}
              </span>
              {c.vencimento && <span>Vence: {fmtDataHora(c.vencimento)}</span>}
              {c.pedido_id_externo && (
                <Link
                  to={`/pedidos/${c.pedido_id_externo}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Ver pedido {c.entidade_ref ?? ""}
                </Link>
              )}
            </div>

            {resolvido && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Aguardando confirmação do solicitante — fecha sozinho em 3 dias úteis.
                  {c.motivo ? ` Motivo do fechamento: ${c.motivo}.` : ""}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          {/* ESQUERDA — descrição e conversa */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="border-primary/30 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">O que o solicitante pediu</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {c.detalhe ?? "Sem descrição."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conversa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mensagensQ.isError ? (
                  <ErroQuery o_que="as mensagens" erro={mensagensQ.error} />
                ) : mensagensQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (mensagensQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. A primeira resposta ainda não foi dada.
                  </p>
                ) : (
                  (mensagensQ.data ?? []).map((m) => {
                    const doAtendente = m.direcao === "atendente";
                    return (
                      <div
                        key={m.id}
                        className={cn("flex", doAtendente ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg border px-3 py-2",
                            m.interna
                              ? "border-amber-500/50 bg-amber-500/10"
                              : doAtendente
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-muted/40",
                          )}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {m.autor_nome ?? "—"}
                            </span>
                            <span>{fmtDataHora(m.criado_em)}</span>
                            {m.interna && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/60 text-[10px] text-amber-700 dark:text-amber-400"
                              >
                                nota interna
                              </Badge>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-sm">{m.texto ?? ""}</p>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Caixa de resposta */}
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={4}
                    placeholder="Escreva a resposta ao solicitante"
                    disabled={!podeEditar || encerrado}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Switch
                        id="interna"
                        checked={interna}
                        onCheckedChange={setInterna}
                        disabled={!podeEditar || encerrado}
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="interna">Nota interna</Label>
                        <p className="text-xs text-muted-foreground">
                          Nota interna não conta como primeira resposta do SLA.
                        </p>
                      </div>
                    </div>
                    {!podeEditar ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button disabled>
                              <Send className="mr-2 h-4 w-4" /> Enviar
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Você tem acesso somente leitura nesta tela
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        onClick={enviarResposta}
                        disabled={enviando || encerrado || !texto.trim()}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {enviando ? "Enviando..." : "Enviar"}
                      </Button>
                    )}
                  </div>
                  {encerrado && (
                    <p className="text-xs text-muted-foreground">
                      Chamado {STATUS_ROTULO[status] ?? status} — não aceita mais mensagens.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DIREITA — ações e trilha */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Ações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {podePegar && (
                  <BotaoAcao onClick={() => abrir("pegar")}>
                    <Hand className="mr-2 h-4 w-4" /> Pegar
                  </BotaoAcao>
                )}
                {podePausar && (
                  <BotaoAcao onClick={() => abrir("pausar")}>
                    <Pause className="mr-2 h-4 w-4" /> Pausar
                  </BotaoAcao>
                )}
                {podeRetomar && (
                  <BotaoAcao onClick={() => abrir("retomar")}>
                    <Play className="mr-2 h-4 w-4" /> Retomar
                  </BotaoAcao>
                )}
                {!encerrado && (
                  <BotaoAcao onClick={() => abrir("passar")}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Passar
                  </BotaoAcao>
                )}
                {meu && !encerrado && (
                  <BotaoAcao onClick={() => abrir("largar")}>
                    <LogOut className="mr-2 h-4 w-4" /> Largar
                  </BotaoAcao>
                )}
                {c.em_triagem && (
                  <BotaoAcao onClick={() => abrir("classificar")}>
                    <Tag className="mr-2 h-4 w-4" /> Classificar
                  </BotaoAcao>
                )}
                {!encerrado && (
                  <BotaoAcao onClick={() => abrir("escalar")}>
                    <ArrowUpCircle className="mr-2 h-4 w-4" /> Escalar
                  </BotaoAcao>
                )}
                {!encerrado && foraDoAtendimento && (
                  <BotaoAcao onClick={() => abrir("devolver")}>
                    <CornerUpLeft className="mr-2 h-4 w-4" /> Devolver
                  </BotaoAcao>
                )}
                {emAberto && (
                  <BotaoAcao variant="default" onClick={() => abrir("resolver")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Resolver
                  </BotaoAcao>
                )}
                {resolvido && (
                  <>
                    <BotaoAcao variant="default" onClick={() => abrir("fechar")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar fechamento
                    </BotaoAcao>
                    <BotaoAcao onClick={() => abrir("reabrir")}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reabrir
                    </BotaoAcao>
                  </>
                )}
                {encerrado && (
                  <p className="text-sm text-muted-foreground">
                    Chamado {STATUS_ROTULO[status] ?? status}
                    {c.fechado_em ? ` em ${fmtDataHora(c.fechado_em)}` : ""}. Nada a fazer.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trilha</CardTitle>
              </CardHeader>
              <CardContent>
                {trilhaQ.isError ? (
                  <ErroQuery o_que="a trilha" erro={trilhaQ.error} />
                ) : trilhaQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (trilhaQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem passos registrados.</p>
                ) : (
                  <ol className="space-y-3">
                    {(trilhaQ.data ?? []).map((t, i) => (
                      <li
                        key={`${t.passo ?? i}-${t.criado_em ?? i}`}
                        className="border-l-2 border-border pl-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              EVENTO_CLASSE[t.evento ?? ""] ?? "",
                            )}
                          >
                            {EVENTO_ROTULO[t.evento ?? ""] ?? t.evento ?? "—"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {fmtDataHora(t.criado_em)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t.ator ?? "—"}
                          {t.cadeira_de || t.cadeira_para
                            ? ` · ${t.cadeira_de ?? "—"} → ${t.cadeira_para ?? "—"}`
                            : ""}
                        </p>
                        {t.motivo_texto && (
                          <p className="mt-1 text-sm font-medium">{t.motivo_texto}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Dialog de ação */}
        <Dialog open={!!acao} onOpenChange={(o) => !o && fechar()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{acao ? TITULO[acao] : ""}</DialogTitle>
              <DialogDescription>
                {c.numero ?? ""} {c.assunto ? `· ${c.assunto}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {acao === "pegar" && (
                <p className="text-sm text-muted-foreground">
                  O chamado passa a ser seu e o atendimento começa a contar para você.
                </p>
              )}

              {acao === "retomar" && (
                <p className="text-sm text-muted-foreground">
                  O relógio do SLA volta a contar a partir de agora.
                </p>
              )}

              {acao === "fechar" && (
                <p className="text-sm text-muted-foreground">
                  Fechar encerra o chamado agora, sem esperar os 3 dias úteis.
                </p>
              )}

              {acao === "classificar" && (
                <div className="space-y-1.5">
                  <Label>Assunto</Label>
                  {assuntosQ.isError ? (
                    <ErroQuery o_que="os assuntos" erro={assuntosQ.error} />
                  ) : (
                    <Select value={assuntoId} onValueChange={setAssuntoId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            assuntosQ.isLoading ? "Carregando..." : "Escolha o assunto"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(assuntosQ.data ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.codigo ? `${a.codigo} · ` : ""}
                            {a.nome ?? a.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {assuntoId && (
                    <p className="text-xs text-muted-foreground">
                      {(assuntosQ.data ?? []).find((a) => a.id === assuntoId)?.descricao ??
                        ""}
                    </p>
                  )}
                </div>
              )}

              {acao === "escalar" && (
                <div className="space-y-1.5">
                  <Label>Cadeira de destino</Label>
                  {cadeirasQ.isError ? (
                    <ErroQuery o_que="as cadeiras" erro={cadeirasQ.error} />
                  ) : (
                    <Select value={cadeiraDestino} onValueChange={setCadeiraDestino}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            cadeirasQ.isLoading ? "Carregando..." : "Escolha a cadeira"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(cadeirasQ.data ?? [])
                          .filter((x) => !!x.cadeira)
                          .map((x) => (
                            <SelectItem key={x.cadeira!} value={x.cadeira!}>
                              {x.cadeira}
                              {x.atende ? ` · ${x.atende}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {acao === "passar" && (
                <div className="space-y-1.5">
                  <Label>Passar para</Label>
                  {pessoasQ.isError ? (
                    <ErroQuery o_que="as pessoas" erro={pessoasQ.error} />
                  ) : (
                    <Select value={paraUser} onValueChange={setParaUser}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            pessoasQ.isLoading ? "Carregando..." : "Escolha quem assume"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(pessoasQ.data ?? []).map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.full_name ?? p.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {acao === "resolver" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Motivo do fechamento (obrigatório)</Label>
                    {motivosQ.isError ? (
                      <ErroQuery o_que="os motivos" erro={motivosQ.error} />
                    ) : (
                      <Select value={motivoCodigo} onValueChange={setMotivoCodigo}>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              motivosQ.isLoading ? "Carregando..." : "Escolha o motivo"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(motivosQ.data ?? []).map((m) => (
                            <SelectItem key={m.codigo} value={m.codigo}>
                              {m.nome ?? m.codigo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {motivoCodigo && (
                      <p className="text-xs text-muted-foreground">
                        {(motivosQ.data ?? []).find((m) => m.codigo === motivoCodigo)
                          ?.remedio ?? ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nota">Nota de resolução (opcional)</Label>
                    <Textarea
                      id="nota"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={4}
                      placeholder="O que foi feito para resolver?"
                    />
                  </div>
                </>
              )}

              {(acao === "pausar" ||
                acao === "passar" ||
                acao === "largar" ||
                acao === "escalar" ||
                acao === "devolver" ||
                acao === "reabrir") && (
                <div className="space-y-1.5">
                  <Label htmlFor="motivo">Motivo (obrigatório)</Label>
                  <Textarea
                    id="motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={4}
                    placeholder={
                      acao === "pausar"
                        ? "O que está travando o chamado?"
                        : acao === "passar"
                          ? "Por que outra pessoa precisa assumir?"
                          : acao === "largar"
                            ? "Por que você está largando o chamado?"
                            : acao === "escalar"
                              ? "Por que outra cadeira precisa resolver?"
                              : acao === "devolver"
                                ? "Por que o chamado volta para o atendimento?"
                                : "Por que o chamado precisa ser reaberto?"
                    }
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={fechar} disabled={executando}>
                Cancelar
              </Button>
              <Button onClick={executar} disabled={executando || invalido}>
                {executando ? "Enviando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </TooltipProvider>
  );
}
