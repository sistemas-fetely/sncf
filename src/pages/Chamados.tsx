import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Hand,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  ArrowRightLeft,
  LogOut,
  Ticket,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

/**
 * Central de Chamados — a fila de trabalho do suporte interno.
 *
 * A tela não decide nada: quem valida permissão, move status e para o relógio do
 * SLA são as RPCs do banco (`pegar_chamado`, `passar_chamado`, `largar_chamado`,
 * `pausar_chamado`, `retomar_chamado`, `responder_chamado`). Aqui só orquestra.
 *
 * MODO-LEITURA-NAO-ESCONDE-DADO: sem `pode_editar` a lista, os filtros e os
 * cards continuam visíveis; o que desaparece é o poder de mudar.
 */

interface Chamado {
  chamado_id: string;
  numero: string | null;
  status: string | null;
  tipo: string | null;
  prioridade: string | null;
  impacto: string | null;
  urgencia: string | null;
  camada: string | null;
  detalhe: string | null;
  criado_em: string | null;
  assunto_codigo: string | null;
  assunto: string | null;
  em_triagem: boolean | null;
  cadeira: string | null;
  cadeira_atual_id: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  sem_dono: boolean | null;
  solicitante: string | null;
  entidade_tipo: string | null;
  pedido_id_externo: string | null;
  entidade_ref: string | null;
  prazo_dias: number | null;
  primeira_resposta_em: string | null;
  pausado_desde: string | null;
  pausado_total_min: number | null;
  horas_corridas: number | null;
  horas_uteis_sla: number | null;
  vencimento: string | null;
  vencido: boolean | null;
  sem_resposta_ha_4h: boolean | null;
  mensagens: number | null;
  resolvido_em: string | null;
  fechado_em: string | null;
  motivo_codigo: string | null;
  motivo: string | null;
}

interface CargaCadeira {
  cadeira: string | null;
  cadeira_id: string | null;
  abertos: number | null;
  sem_dono: number | null;
  em_andamento: number | null;
  pendentes: number | null;
  vencidos: number | null;
  em_triagem: number | null;
  mais_antigo: string | null;
}

interface Pessoa {
  user_id: string;
  full_name: string | null;
}

const QK = {
  lista: ["vw_chamado_lista"] as const,
  carga: ["vw_chamado_carga_cadeira"] as const,
  pessoas: ["profiles", "chamados"] as const,
};

const STATUS_ABERTOS = ["novo", "atribuido", "em_andamento", "pendente"];

type Visao =
  | "abertos"
  | "meus"
  | "sem_dono"
  | "vencidos"
  | "sem_resposta"
  | "em_triagem"
  | "pendentes"
  | "todos";

const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: "abertos", rotulo: "Abertos" },
  { valor: "meus", rotulo: "Meus" },
  { valor: "sem_dono", rotulo: "Sem dono" },
  { valor: "vencidos", rotulo: "Vencidos" },
  { valor: "sem_resposta", rotulo: "Sem resposta" },
  { valor: "em_triagem", rotulo: "Em triagem" },
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "todos", rotulo: "Todos" },
];

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

const PRIORIDADE_ORDEM: Record<string, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
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

export default function Chamados() {
  return (
    <PermissaoTelaProvider slug="tela.chamados">
      <ChamadosConteudo />
    </PermissaoTelaProvider>
  );
}

type AcaoTipo = "pegar" | "responder" | "pausar" | "retomar" | "passar" | "largar";

function ChamadosConteudo() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { podeEditar } = usePermissaoTelaContext();

  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<Visao>("abertos");
  const [cadeira, setCadeira] = useState<string>("todas");
  const [prioridade, setPrioridade] = useState<string>("todas");
  const [tipo, setTipo] = useState<string>("todos");
  const [ordem, setOrdem] = useState<"antigo" | "prioridade" | "vencimento">("antigo");

  const [acao, setAcao] = useState<AcaoTipo | null>(null);
  const [alvo, setAlvo] = useState<Chamado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [paraUser, setParaUser] = useState("");
  const [executando, setExecutando] = useState(false);

  const lista = useQuery({
    queryKey: QK.lista,
    queryFn: async (): Promise<Chamado[]> => {
      const { data, error } = await supabase
        .from("vw_chamado_lista")
        .select("*")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Chamado[];
    },
  });

  const carga = useQuery({
    queryKey: QK.carga,
    queryFn: async (): Promise<CargaCadeira[]> => {
      const { data, error } = await supabase.from("vw_chamado_carga_cadeira").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CargaCadeira[];
    },
  });

  const pessoas = useQuery({
    queryKey: QK.pessoas,
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Pessoa[];
    },
  });

  const cadeiras = useMemo(() => {
    const nomes = new Set<string>();
    for (const c of lista.data ?? []) if (c.cadeira) nomes.add(c.cadeira);
    for (const c of carga.data ?? []) if (c.cadeira) nomes.add(c.cadeira);
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [lista.data, carga.data]);

  const filtrados = useMemo(() => {
    let itens = lista.data ?? [];

    switch (visao) {
      case "abertos":
        itens = itens.filter((c) => STATUS_ABERTOS.includes(c.status ?? ""));
        break;
      case "meus":
        itens = itens.filter((c) => !!user?.id && c.atribuido_a === user.id);
        break;
      case "sem_dono":
        itens = itens.filter((c) => c.sem_dono === true && c.status === "novo");
        break;
      case "vencidos":
        itens = itens.filter((c) => c.vencido === true);
        break;
      case "sem_resposta":
        itens = itens.filter((c) => c.sem_resposta_ha_4h === true);
        break;
      case "em_triagem":
        itens = itens.filter((c) => c.em_triagem === true);
        break;
      case "pendentes":
        itens = itens.filter((c) => c.status === "pendente");
        break;
      case "todos":
        break;
    }

    if (cadeira !== "todas") itens = itens.filter((c) => c.cadeira === cadeira);
    if (prioridade !== "todas") itens = itens.filter((c) => c.prioridade === prioridade);
    if (tipo !== "todos") itens = itens.filter((c) => c.tipo === tipo);

    const termo = busca.trim().toLowerCase();
    if (termo) {
      itens = itens.filter((c) =>
        [c.numero, c.detalhe, c.solicitante]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo)),
      );
    }

    const copia = [...itens];
    if (ordem === "prioridade") {
      copia.sort(
        (a, b) =>
          (PRIORIDADE_ORDEM[a.prioridade ?? ""] ?? 9) -
            (PRIORIDADE_ORDEM[b.prioridade ?? ""] ?? 9) ||
          (a.criado_em ?? "").localeCompare(b.criado_em ?? ""),
      );
    } else if (ordem === "vencimento") {
      copia.sort((a, b) => {
        if (!a.vencimento && !b.vencimento) return 0;
        if (!a.vencimento) return 1;
        if (!b.vencimento) return -1;
        return a.vencimento.localeCompare(b.vencimento);
      });
    } else {
      copia.sort((a, b) => (a.criado_em ?? "").localeCompare(b.criado_em ?? ""));
    }
    return copia;
  }, [lista.data, visao, cadeira, prioridade, tipo, busca, ordem, user?.id]);

  function abrir(tipoAcao: AcaoTipo, chamado: Chamado) {
    setAcao(tipoAcao);
    setAlvo(chamado);
    setMotivo("");
    setTexto("");
    setInterna(false);
    setParaUser("");
  }

  function fechar() {
    setAcao(null);
    setAlvo(null);
  }

  async function invalidar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK.lista }),
      qc.invalidateQueries({ queryKey: QK.carga }),
    ]);
  }

  async function executar() {
    if (!alvo || !acao) return;
    setExecutando(true);
    try {
      if (acao === "pegar") {
        const { error } = await supabase.rpc("pegar_chamado", { p_chamado_id: alvo.chamado_id });
        if (error) throw error;
        toast.success(`Chamado ${alvo.numero ?? ""} é seu.`);
      } else if (acao === "responder") {
        const { error } = await supabase.rpc("responder_chamado", {
          p_chamado_id: alvo.chamado_id,
          p_texto: texto.trim(),
          p_interna: interna,
        });
        if (error) throw error;
        toast.success(interna ? "Nota interna registrada." : "Resposta enviada.");
      } else if (acao === "pausar") {
        const { error } = await supabase.rpc("pausar_chamado", {
          p_chamado_id: alvo.chamado_id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado pausado — relógio do SLA parado.");
      } else if (acao === "retomar") {
        const { error } = await supabase.rpc("retomar_chamado", {
          p_chamado_id: alvo.chamado_id,
        });
        if (error) throw error;
        toast.success("Chamado retomado.");
      } else if (acao === "passar") {
        const { error } = await supabase.rpc("passar_chamado", {
          p_chamado_id: alvo.chamado_id,
          p_para_user_id: paraUser,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado passado.");
      } else if (acao === "largar") {
        const { error } = await supabase.rpc("largar_chamado", {
          p_chamado_id: alvo.chamado_id,
          p_motivo_texto: motivo.trim(),
        });
        if (error) throw error;
        toast.success("Chamado largado.");
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
    (acao === "responder" && !texto.trim()) ||
    (acao === "pausar" && !motivo.trim()) ||
    (acao === "largar" && !motivo.trim()) ||
    (acao === "passar" && (!motivo.trim() || !paraUser));

  const TITULO: Record<AcaoTipo, string> = {
    pegar: "Pegar chamado",
    responder: "Responder chamado",
    pausar: "Pausar chamado",
    retomar: "Retomar chamado",
    passar: "Passar chamado",
    largar: "Largar chamado",
  };

  return (
    <PageShell>
      <PageHeader
        titulo="Central de Chamados"
        icone={Ticket}
        estado={
          lista.isLoading
            ? "Carregando fila..."
            : `${filtrados.length} chamado(s) na visão atual`
        }
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      {/* Cards por cadeira */}
      {carga.isError ? (
        <ErroQuery o_que="a carga por cadeira" erro={carga.error} />
      ) : carga.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (carga.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma cadeira com chamados.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(carga.data ?? []).map((c) => {
            const alerta = (c.vencidos ?? 0) > 0;
            const ativo = cadeira === c.cadeira;
            return (
              <Card
                key={c.cadeira_id ?? c.cadeira ?? "—"}
                onClick={() => setCadeira(ativo ? "todas" : (c.cadeira ?? "todas"))}
                className={cn(
                  "cursor-pointer transition-colors hover:border-primary/50",
                  alerta && "border-destructive/60 bg-destructive/5",
                  ativo && "ring-2 ring-primary/40",
                )}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.cadeira ?? "—"}</span>
                    <span className="text-2xl font-semibold leading-none">
                      {c.abertos ?? 0}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>sem dono {c.sem_dono ?? 0}</span>
                    <span>em andamento {c.em_andamento ?? 0}</span>
                    <span>pendentes {c.pendentes ?? 0}</span>
                    <span className={alerta ? "font-medium text-destructive" : undefined}>
                      vencidos {c.vencidos ?? 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, detalhe ou solicitante"
            className="h-9 w-full max-w-xs"
          />
          <Select value={cadeira} onValueChange={setCadeira}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="Cadeira" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as cadeiras</SelectItem>
              {cadeiras.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={prioridade} onValueChange={setPrioridade}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda prioridade</SelectItem>
              {["critica", "alta", "media", "baixa"].map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORIDADE_ROTULO[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo tipo</SelectItem>
              {["incidente", "requisicao", "duvida"].map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_ROTULO[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ordem} onValueChange={(v) => setOrdem(v as typeof ordem)}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="antigo">Mais antigo primeiro</SelectItem>
              <SelectItem value="prioridade">Prioridade</SelectItem>
              <SelectItem value="vencimento">Vencimento</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtrados.length} resultado(s)
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {VISOES.map((v) => (
            <Button
              key={v.valor}
              size="sm"
              variant={visao === v.valor ? "default" : "outline"}
              onClick={() => setVisao(v.valor)}
            >
              {v.rotulo}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {lista.isError ? (
        <ErroQuery o_que="a lista de chamados" erro={lista.error} />
      ) : lista.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Nenhum chamado nesta visão.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Troque a visão, a cadeira ou limpe a busca para ver outros chamados.
          </p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Cadeira</TableHead>
                  <TableHead>Dono</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Aging</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead className="text-right">Msg</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => {
                  const meu = !!user?.id && c.atribuido_a === user.id;
                  const podePegar = c.status === "novo" || c.status === "atribuido";
                  const podePausar =
                    c.status === "atribuido" || c.status === "em_andamento";
                  const podeRetomar = c.status === "pendente";
                  return (
                    <TableRow
                      key={c.chamado_id}
                      className={cn(
                        c.vencido && "border-l-2 border-l-destructive bg-destructive/[0.03]",
                      )}
                    >
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {c.numero ?? "—"}
                        <div className="text-[10px] text-muted-foreground">
                          {STATUS_ROTULO[c.status ?? ""] ?? c.status ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            PRIORIDADE_CLASSE[c.prioridade ?? ""] ?? "",
                          )}
                        >
                          {PRIORIDADE_ROTULO[c.prioridade ?? ""] ?? c.prioridade ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {TIPO_ROTULO[c.tipo ?? ""] ?? c.tipo ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        {c.assunto ? (
                          <span className="line-clamp-2 text-sm">{c.assunto}</span>
                        ) : c.em_triagem ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/60 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                          >
                            sem assunto
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                        {c.detalhe && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {c.detalhe}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {c.cadeira ?? "—"}
                        {c.camada && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {c.camada}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {c.sem_dono ? (
                          <Badge variant="outline" className="text-[10px]">
                            sem dono
                          </Badge>
                        ) : (
                          (c.atribuido_nome ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{c.solicitante ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {fmtAging(c.horas_corridas)}
                          {c.pausado_desde && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                  <Pause className="h-3 w-3" />
                                  <span className="text-[10px]">
                                    {fmtMinutos(c.pausado_total_min)}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Relógio pausado — aguardando solicitante
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.vencido && (
                            <Badge
                              variant="outline"
                              className="border-destructive/60 bg-destructive/10 text-[10px] text-destructive"
                            >
                              vencido
                            </Badge>
                          )}
                          {c.sem_resposta_ha_4h && (
                            <Badge
                              variant="outline"
                              className="border-orange-500/60 bg-orange-500/10 text-[10px] text-orange-700 dark:text-orange-400"
                            >
                              sem resposta
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.mensagens ?? 0}
                      </TableCell>
                      <TableCell>
                        {podeEditar ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {podePegar && (
                                <DropdownMenuItem onClick={() => abrir("pegar", c)}>
                                  <Hand className="mr-2 h-4 w-4" /> Pegar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => abrir("responder", c)}>
                                <MessageSquare className="mr-2 h-4 w-4" /> Responder
                              </DropdownMenuItem>
                              {podePausar && (
                                <DropdownMenuItem onClick={() => abrir("pausar", c)}>
                                  <Pause className="mr-2 h-4 w-4" /> Pausar
                                </DropdownMenuItem>
                              )}
                              {podeRetomar && (
                                <DropdownMenuItem onClick={() => abrir("retomar", c)}>
                                  <Play className="mr-2 h-4 w-4" /> Retomar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => abrir("passar", c)}>
                                <ArrowRightLeft className="mr-2 h-4 w-4" /> Passar
                              </DropdownMenuItem>
                              {meu && (
                                <DropdownMenuItem onClick={() => abrir("largar", c)}>
                                  <LogOut className="mr-2 h-4 w-4" /> Largar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Você tem acesso somente leitura nesta tela
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      {/* Dialog de ação */}
      <Dialog open={!!acao} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{acao ? TITULO[acao] : ""}</DialogTitle>
            <DialogDescription>
              {alvo?.numero ?? ""} {alvo?.assunto ? `· ${alvo.assunto}` : ""}
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

            {acao === "responder" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="resposta">Resposta</Label>
                  <Textarea
                    id="resposta"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={5}
                    placeholder="Escreva a resposta ao solicitante"
                  />
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <Switch
                    id="interna"
                    checked={interna}
                    onCheckedChange={setInterna}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="interna">Nota interna</Label>
                    <p className="text-xs text-muted-foreground">
                      Nota interna fica só para o time e não conta como primeira
                      resposta para o SLA.
                    </p>
                  </div>
                </div>
              </>
            )}

            {acao === "passar" && (
              <div className="space-y-1.5">
                <Label>Passar para</Label>
                {pessoas.isError ? (
                  <ErroQuery o_que="as pessoas" erro={pessoas.error} />
                ) : (
                  <Select value={paraUser} onValueChange={setParaUser}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={pessoas.isLoading ? "Carregando..." : "Escolha quem assume"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(pessoas.data ?? []).map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name ?? p.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {(acao === "pausar" || acao === "passar" || acao === "largar") && (
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
                        : "Por que você está largando o chamado?"
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
  );
}
