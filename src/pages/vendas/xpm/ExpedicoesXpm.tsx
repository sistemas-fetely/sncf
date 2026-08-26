import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import AlertaDivergencia from "./AlertaDivergencia";
import FunilFases from "./FunilFases";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
type ExpedicaoXpm = {
  codigo: string;
  data_expedicao: string | null;
  situacao: string | null;
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  transportador_cnpj: string | null;
  transportadora_nome: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave: string | null;
  quantidade_volumes: number | null;
  peso_bruto: number | null;
  estagio_codigo: string;
  estagio_descricao: string;
  estagio_seq: number;
  arquivo_fase_rotulo: string | null;
  arquivo_fase_ordem: number | null;
  arquivo_seq_equiv: number | null;
  arquivo_observado_em: string | null;
  arquivo_gerado_em: string | null;
  fase_seq_verdade: number;
  fonte_da_verdade: "api" | "arquivo" | "empate" | "sem_arquivo";
  fase_seq: number;
  fase_rotulo: string;
  fase_seq_em_andamento: number | null;
  fase_rotulo_em_andamento: string | null;
  tem_casa_em_andamento: boolean;
  ultimo_evento_em: string | null;
  dias_parado: number | null;
  canal: "B2B" | "B2C" | "SEM NF";
  pedido_sncf: string | null;
  pedido_id: string | null;
  cliente_sncf: string | null;
  uf: string | null;
  qtd_itens: number | null;
  qtd_solicitada: number | null;
  qtd_atendida: number | null;
  tem_corte: boolean;
  sincronizado_em: string | null;
  t_solicitado?: string | null;
  t_embarcado?: string | null;
  t_expedido?: string | null;
  horas_ciclo_bruto?: number | null;
  horas_pausadas?: number;
  horas_ciclo_liquido?: number | null;
  horas_em_curso_liquido?: number | null;
  qtd_pausas?: number;
  pausada_agora?: boolean;
  concluida?: boolean;
  pedido_loja: string | null;
  numero_pedido_loja: string | null;
  cidade_entrega: string | null;
  pedido_display: string | null;
  uf_display: string | null;
  farol: "concluida" | "pausada" | "risco" | "atencao" | "no_prazo";
  limiar_atencao: number | null;
  limiar_risco: number | null;
  horas_sla: number | null;
  horas_cliente: number | null;
  horas_xpm: number | null;
  horas_fim_de_semana: number;
  dentro_sla_cliente: boolean | null;
  dentro_sla_xpm: boolean | null;
  horas_excedidas_cliente: number | null;
  horas_excedidas_xpm: number | null;
  estouro_so_por_fim_de_semana: boolean | null;
  farol_sla: "no_prazo" | "atencao" | "estourado" | null;
};

// A cor da coluna vem do relogio da XPM (desconta fim de semana), porque esta
// tela e de triagem: cor vermelha tem que significar que cabe acao.
// O relogio do cliente (hora corrida) segue visivel no tooltip.
function CelulaSla({ r }: { r: ExpedicaoXpm }) {
  if (r.horas_sla == null) return <span className="text-muted-foreground">—</span>;

  const arred = (v: number | null | undefined) => Math.round(Number(v ?? 0));
  const farol = r.farol_sla;
  if (!farol) return <span className="text-muted-foreground">—</span>;

  let badge: React.ReactNode;
  if (farol === "estourado") {
    const h = arred(r.horas_excedidas_xpm);
    badge = (
      <Badge variant="destructive" className="text-xs font-normal">
        {h > 48 ? `+${Math.round(h / 24)}d` : `+${h}h`}
      </Badge>
    );
  } else if (farol === "atencao") {
    badge = (
      <Badge
        variant="outline"
        className="text-xs font-normal border-warning/50 bg-warning/10 text-warning"
      >
        {arred(r.horas_xpm)}/{arred(r.horas_sla)}h
      </Badge>
    );
  } else {
    badge = (
      <Badge variant="outline" className="text-xs font-normal">
        {arred(r.horas_xpm)}/{arred(r.horas_sla)}h
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          {badge}
          {r.estouro_so_por_fim_de_semana === true && (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          <div>
            Relógio XPM: {arred(r.horas_xpm)}h de {arred(r.horas_sla)}h
          </div>
          <div>Cliente esperando: {arred(r.horas_cliente)}h</div>
          {r.estouro_so_por_fim_de_semana === true && (
            <div>Fora do prazo do cliente só por causa do fim de semana.</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}




type MotivoPausa = {
  id: string;
  codigo: string | null;
  descricao: string | null;
  culpa_nossa: boolean | null;
  ordem: number | null;
};

type PausaXpm = {
  id: string;
  motivo_id: string;
  observacao: string | null;
  pausado_em: string;
  retomado_em: string | null;
};

type ItemXpm = {
  numero_item: number | null;
  codigo_produto: string | null;
  quantidade_solicitada: number | null;
  quantidade_atendida: number | null;
  valor_unitario: number | null;
};

type EventoXpm = {
  evento_id: number;
  status: string | null;
  inicio: string | null;
  quantidade: number | null;
};

type FaseXpm = {
  wns_id: number;
  codigo: string | null;
  descricao: string | null;
  sequencia: number | null;
};

const ESTAGIOS = [
  "SOLICITADO",
  "SEPARADO",
  "CONFERIDO",
  "NOTAFISCAL",
  "EMBARCADO",
  "EXPEDIDO",
] as const;

const FASES_LABEL = [
  "Solicitado",
  "Separado",
  "Conferido",
  "Nota Fiscal",
  "Embarcado",
  "Expedido",
];

const nf = new Intl.NumberFormat("pt-BR");
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtData(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

// Horario em que a XPM registrou SOLICITADO — a entrada do pedido no armazem.
const dfDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const dfHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function CelulaSolicitado({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div className="tabular-nums">{dfDiaMes.format(d)}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{dfHora.format(d)}</div>
    </div>
  );
}

function fmtDataHora(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR");
}

const JANELA_POS_EMBARQUE_DIAS = 5;

function dentroJanela(r: ExpedicaoXpm) {
  const ref = r.t_expedido ?? r.data_expedicao;
  if (!ref) return false;
  const dias = (Date.now() - new Date(ref).getTime()) / 86_400_000;
  return dias <= JANELA_POS_EMBARQUE_DIAS;
}

function recemExpedida(r: ExpedicaoXpm) {
  return Number(r.estagio_seq) >= 6 && dentroJanela(r);
}

function desdeQuando(v: string | null) {
  if (!v) return "nunca sincronizado";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "nunca sincronizado";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "sincronizado agora";
  if (min < 60) return `sincronizado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `sincronizado há ${h} h`;
  return `sincronizado há ${Math.floor(h / 24)} d`;
}

function Semaforo({
  seq,
  emAndamentoSeq,
  temCasaEmAndamento,
  rotuloEmAndamento,
}: {
  seq: number;
  emAndamentoSeq: number | null;
  temCasaEmAndamento: boolean;
  rotuloEmAndamento: string | null;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {FASES_LABEL.map((label, i) => {
        const n = i + 1;
        const cheio = n <= seq;
        const cinza = temCasaEmAndamento && n === emAndamentoSeq;
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span
                className={`h-3 w-3 rounded-sm border ${
                  cinza
                    ? "bg-success/40 border-success/60"
                    : cheio
                      ? "bg-success border-success/40"
                      : "border-muted-foreground/40"
                }`}
              />
            </TooltipTrigger>
            <TooltipContent>
              {cinza && rotuloEmAndamento
                ? `${rotuloEmAndamento} — em andamento`
                : label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function fmtHoras(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Number(v).toFixed(1)} h`;
}

function BlocoPausa({ codigo }: { codigo: string }) {
  const qc = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const motivosQ = useQuery({
    queryKey: ["xpm-motivos-pausa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_motivo_pausa")
        .select("id, codigo, descricao, culpa_nossa, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as MotivoPausa[];
    },
  });

  const pausasQ = useQuery({
    queryKey: ["xpm-pausas", codigo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_expedicao_pausa")
        .select("id, motivo_id, observacao, pausado_em, retomado_em")
        .eq("expedicao_codigo", codigo)
        .order("pausado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PausaXpm[];
    },
  });

  const motivoNome = (id: string) => {
    const m = (motivosQ.data ?? []).find((x) => String(x.id) === String(id));
    return m?.descricao ?? m?.codigo ?? "Motivo não catalogado";
  };

  const pausas = pausasQ.data ?? [];
  const aberta = pausas.find((p) => p.retomado_em == null) ?? null;
  const encerradas = pausas.filter((p) => p.retomado_em != null);

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["xpm-expedicoes"] });
    qc.invalidateQueries({ queryKey: ["xpm-pausas", codigo] });
  }

  async function pausar() {
    if (!motivoId) {
      toast.error("Escolha o motivo da pausa.");
      return;
    }
    setSalvando(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await (supabase as any).from("xpm_expedicao_pausa").insert({
        expedicao_codigo: codigo,
        motivo_id: motivoId,
        observacao: observacao.trim() || null,
        criado_por: userId,
      });
      if (error) throw error;
      toast.success("Expedição pausada.");
      setDialogAberto(false);
      setMotivoId("");
      setObservacao("");
      invalidar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao pausar expedição", {
        description: e?.details ?? e?.hint ?? undefined,
      });
    } finally {
      setSalvando(false);
    }
  }

  async function retomar(id: string) {
    setSalvando(true);
    try {
      const { error } = await (supabase as any)
        .from("xpm_expedicao_pausa")
        .update({ retomado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Expedição retomada.");
      invalidar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao retomar expedição", {
        description: e?.details ?? e?.hint ?? undefined,
      });
    } finally {
      setSalvando(false);
    }
  }

  const horas = (ini: string, fim: string) =>
    ((new Date(fim).getTime() - new Date(ini).getTime()) / 3600000).toFixed(1);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pausa</div>

      {pausasQ.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : pausasQ.isError ? (
        <div className="text-sm text-destructive">
          {(pausasQ.error as Error)?.message ?? "Erro ao carregar pausas"}
        </div>
      ) : (
        <div className="space-y-3">
          {aberta ? (
            <div className="rounded-md border border-warning/50 bg-warning/5 p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Pausado</Badge>
                <span className="text-sm font-medium">{motivoNome(aberta.motivo_id)}</span>
                <span className="text-xs text-muted-foreground">
                  desde {fmtDataHora(aberta.pausado_em)} ({horas(aberta.pausado_em, new Date().toISOString())} h)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={salvando}
                  onClick={() => retomar(aberta.id)}
                >
                  Retomar
                </Button>
              </div>
              {aberta.observacao && (
                <div className="text-sm text-muted-foreground">{aberta.observacao}</div>
              )}
            </div>
          ) : (
            <div>
              <Button size="sm" variant="outline" onClick={() => setDialogAberto(true)}>
                Pausar
              </Button>
            </div>
          )}

          {encerradas.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {encerradas.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  <span className="font-medium text-foreground">{motivoNome(p.motivo_id)}</span>
                  <span>
                    {fmtDataHora(p.pausado_em)} → {fmtDataHora(p.retomado_em)}
                  </span>
                  <span className="tabular-nums">{horas(p.pausado_em, p.retomado_em as string)} h</span>
                  {p.observacao && <span>· {p.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar expedição {codigo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={motivoId} onValueChange={setMotivoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {(motivosQ.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.descricao ?? m.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={pausar} disabled={salvando || !motivoId}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar pausa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinhaExpandida({ exp, fases }: { exp: ExpedicaoXpm; fases: Map<number, string> }) {

  const itensQ = useQuery({
    queryKey: ["xpm-expedicao-itens", exp.codigo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_expedicao_item")
        .select("numero_item, codigo_produto, quantidade_solicitada, quantidade_atendida, valor_unitario")
        .eq("expedicao_codigo", exp.codigo)
        .order("numero_item");
      if (error) throw error;
      return (data ?? []) as ItemXpm[];
    },
  });

  const eventosQ = useQuery({
    queryKey: ["xpm-expedicao-eventos", exp.codigo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_expedicao_evento")
        .select("evento_id, status, inicio, quantidade")
        .eq("expedicao_codigo", exp.codigo)
        // A XPM reemite fases antigas com evento_zenlog_id novo. A linha do
        // tempo mostra so a primeira ocorrencia de cada fase.
        .eq("eh_reemissao", false)
        .order("inicio");
      if (error) throw error;
      return (data ?? []) as EventoXpm[];
    },
  });

  return (
    <PageShell className="bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Transportadora</div>
          <div>{exp.transportadora_nome ?? exp.transportador_cnpj ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Volumes</div>
          <div className="tabular-nums">{exp.quantidade_volumes ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Peso bruto</div>
          <div className="tabular-nums">
            {exp.peso_bruto != null ? `${nf2.format(Number(exp.peso_bruto))} kg` : "—"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Chave da NF</div>
          <div className="font-mono text-xs truncate" title={exp.nf_chave ?? ""}>
            {exp.nf_chave ?? "—"}
          </div>
        </div>
      </div>

      <BlocoPausa codigo={exp.codigo} />

      <div className="space-y-2">

        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Linha do tempo (eventos por volume)
        </div>
        {eventosQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : eventosQ.isError ? (
          <div className="text-sm text-destructive">
            {(eventosQ.error as Error)?.message ?? "Erro ao carregar eventos"}
          </div>
        ) : (eventosQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum evento registrado.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {(eventosQ.data ?? []).map((ev, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                <span className="font-medium">
                  {fases.get(ev.evento_id) ?? `Evento ${ev.evento_id}`}
                </span>
                <span className="text-muted-foreground text-xs">{fmtDataHora(ev.inicio)}</span>
                {ev.quantidade != null && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    qtd {nf.format(Number(ev.quantidade))}
                  </span>
                )}
                {ev.status && <span className="text-muted-foreground text-xs">{ev.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Itens
        </div>
        {itensQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : itensQ.isError ? (
          <div className="text-sm text-destructive">
            {(itensQ.error as Error)?.message ?? "Erro ao carregar itens"}
          </div>
        ) : (itensQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum item registrado.</div>
        ) : (
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right w-[120px]">Solicitado</TableHead>
                  <TableHead className="text-right w-[140px]">Atendido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itensQ.data ?? []).map((it, i) => {
                  const sol = Number(it.quantidade_solicitada ?? 0);
                  const at = it.quantidade_atendida;
                  const corte = at != null && Number(at) < sol;
                  return (
                    <TableRow key={`${it.codigo_produto}-${it.numero_item}-${i}`}>
                      <TableCell className="font-mono text-xs">{it.codigo_produto ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.quantidade_solicitada != null ? nf.format(sol) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          corte ? "text-destructive font-medium" : ""
                        }`}
                      >
                        {at == null
                          ? "—"
                          : corte
                            ? `${nf.format(Number(at))} (−${nf.format(sol - Number(at))})`
                            : nf.format(Number(at))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export default function ExpedicoesXpm() {
  const qc = useQueryClient();
  const [canal, setCanal] = useState("todos");
  const [estagio, setEstagio] = useState("todos");
  const [situacao, setSituacao] = useState("curso_5d");
  const [farolFiltro, setFarolFiltro] = useState<"risco" | "atencao" | null>(null);
  const [slaFiltro, setSlaFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const expedicoesQ = useQuery({
    queryKey: ["xpm-expedicoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_risco_atraso")
        .select("*")
        .order("data_expedicao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpedicaoXpm[];
    },
    // Painel operacional: fica aberto o dia inteiro. Sem isto, o rotulo de
    // "sincronizado ha X" media a idade da ABA, nao a saude da integracao.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });




  const fasesQ = useQuery({
    queryKey: ["wns-fases-xpm"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wns_fases_xpm")
        .select("wns_id, codigo, descricao, sequencia");
      if (error) throw error;
      return (data ?? []) as FaseXpm[];
    },
  });

  const mapaFases = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of fasesQ.data ?? []) {
      m.set(Number(f.wns_id), f.descricao ?? f.codigo ?? `Evento ${f.wns_id}`);
    }
    return m;
  }, [fasesQ.data]);

  const rows = expedicoesQ.data ?? [];

  const kpis = useMemo(() => {
    const emCurso = rows.filter((r) => Number(r.estagio_seq) < 6);
    return {
      emCurso: emCurso.length,
      semNf: rows.filter((r) => Number(r.estagio_seq) >= 2 && Number(r.estagio_seq) < 4).length,
      atencao: rows.filter((r) => r.farol === "atencao").length,
      risco: rows.filter((r) => r.farol === "risco").length,
      corte: rows.filter((r) => r.tem_corte === true).length,
      peso: emCurso.reduce((s, r) => s + Number(r.peso_bruto ?? 0), 0),
    };
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (canal !== "todos" && r.canal !== canal) return false;
      if (estagio !== "todos" && r.estagio_codigo !== estagio) return false;
      if (farolFiltro && r.farol !== farolFiltro) return false;
      if (slaFiltro !== "todos" && r.farol_sla !== slaFiltro) return false;
      // JANELA-POS-EMBARQUE: o momento de maior risco e logo depois do embarque,
      // quando ainda da pra corrigir volume, transportadora ou NF divergente.
      // Sumir com a expedicao nesse instante e o pior timing possivel.
      const emCurso = Number(r.estagio_seq) < 6;
      if (situacao === "em_curso" && !emCurso) return false;
      if (situacao === "expedidas" && emCurso) return false;
      if (situacao === "curso_5d" && !emCurso && !dentroJanela(r)) return false;
      if (!q) return true;
      return [
        r.codigo,
        r.nf_numero,
        r.pedido_sncf,
        r.pedido_display,
        r.pedido_loja,
        r.cidade_entrega,
        r.cliente_sncf,
        r.destinatario_nome,
      ]

        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, canal, estagio, situacao, busca, farolFiltro, slaFiltro]);

  const ultimoSync = useMemo(() => {
    let melhor: string | null = null;
    for (const r of rows) {
      if (r.sincronizado_em && (!melhor || r.sincronizado_em > melhor)) melhor = r.sincronizado_em;
    }
    return melhor;
  }, [rows]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("zenlog-sync-expedicoes", {
        body: { dias: 45 },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).erro ?? "Falha na sincronização");
      toast.success(`Sincronizado: ${(data as any)?.expedicoes ?? 0} expedições`);
      qc.invalidateQueries({ queryKey: ["xpm-expedicoes"] });
      qc.invalidateQueries({ queryKey: ["xpm-expedicao-itens"] });
      qc.invalidateQueries({ queryKey: ["xpm-expedicao-eventos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao sincronizar expedições da XPM");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageShell>
        <PageHeader
          titulo="Expedições XPM"
          estado="Andamento físico das expedições no armazém, do pedido ao embarque."
          acoes={
            <>
              <span className="text-xs text-muted-foreground">{desdeQuando(ultimoSync)}</span>
              <Button onClick={sincronizar} disabled={sincronizando} className="gap-2">
                {sincronizando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar
              </Button>
            </>
          }
        />

        <AlertaDivergencia />

        <FunilFases
          estagioAtivo={estagio === "todos" ? null : estagio}
          onSelecionar={(codigo) => setEstagio(estagio === codigo ? "todos" : codigo)}
        />


        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Em curso</div>
              <div className="text-2xl font-medium">{nf.format(kpis.emCurso)}</div>
            </CardContent>
          </Card>
          <Card className={kpis.semNf > 0 ? "border-warning/50" : undefined}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Separado sem NF</div>
              <div
                className={`text-2xl font-medium ${
                  kpis.semNf > 0 ? "text-warning" : ""
                }`}
              >
                {nf.format(kpis.semNf)}
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setFarolFiltro(farolFiltro === "atencao" ? null : "atencao")}
            className={`cursor-pointer ${
              farolFiltro === "atencao"
                ? "border-warning/40 ring-1 ring-warning/40"
                : kpis.atencao > 0
                  ? "border-warning/50"
                  : ""
            }`}
          >
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Em atenção</div>
              <div
                className={`text-2xl font-medium ${
                  kpis.atencao > 0 ? "text-warning" : ""
                }`}
              >
                {nf.format(kpis.atencao)}
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setFarolFiltro(farolFiltro === "risco" ? null : "risco")}
            className={`cursor-pointer ${
              farolFiltro === "risco"
                ? "border-destructive ring-1 ring-destructive/40"
                : kpis.risco > 0
                  ? "border-destructive/50"
                  : ""
            }`}
          >
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {kpis.risco > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />}
                Em risco
              </div>
              <div className={`text-2xl font-medium ${kpis.risco > 0 ? "text-destructive" : ""}`}>
                {nf.format(kpis.risco)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Com corte</div>
              <div className="text-2xl font-medium">{nf.format(kpis.corte)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Peso em curso</div>
              <div className="text-2xl font-medium">{nf2.format(kpis.peso)} kg</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expedições</CardTitle>
            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <Input
                placeholder="Buscar por pedido, cliente, NF ou código XPM…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="md:max-w-sm"
              />
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger className="md:max-w-[160px]">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  <SelectItem value="B2B">B2B</SelectItem>
                  <SelectItem value="B2C">B2C</SelectItem>
                  <SelectItem value="SEM NF">SEM NF</SelectItem>
                </SelectContent>
              </Select>
              <Select value={estagio} onValueChange={setEstagio}>
                <SelectTrigger className="md:max-w-[180px]">
                  <SelectValue placeholder="Estágio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os estágios</SelectItem>
                  {ESTAGIOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger className="md:max-w-[180px]">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="curso_5d">Em curso + 5 dias</SelectItem>
                  <SelectItem value="em_curso">Só em curso</SelectItem>
                  <SelectItem value="todos">Todos (45 dias)</SelectItem>
                  <SelectItem value="expedidas">Só expedidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={slaFiltro} onValueChange={setSlaFiltro}>
                <SelectTrigger className="md:max-w-[170px]">
                  <SelectValue placeholder="SLA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">SLA: todos</SelectItem>
                  <SelectItem value="no_prazo">No prazo</SelectItem>
                  <SelectItem value="atencao">Atenção</SelectItem>
                  <SelectItem value="estourado">Estourado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {expedicoesQ.isError ? (
              <Card className="border-destructive">
                <CardContent className="pt-6 text-sm text-destructive">
                  {(expedicoesQ.error as Error)?.message ?? "Erro ao carregar expedições"}
                </CardContent>
              </Card>
            ) : expedicoesQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]" />
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-[60px]">UF</TableHead>
                      <TableHead className="w-[90px]">Canal</TableHead>
                      <TableHead className="w-[110px]">Solicitado</TableHead>
                      <TableHead className="w-[220px]">Estágio</TableHead>

                      <TableHead className="text-right w-[70px]">Vol</TableHead>
                      <TableHead className="text-right w-[100px]">Peso</TableHead>
                      <TableHead className="w-[92px]">SLA</TableHead>
                      <TableHead className="text-right w-[80px]">Dias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          Nenhuma expedição neste recorte.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtradas.map((r) => {
                        const dias = r.dias_parado == null ? null : Number(r.dias_parado);
                        const pausada = r.pausada_agora === true;
                        const atrasado = !pausada && dias != null && dias > 5;
                        const expandido = aberto === r.codigo;
                        const fundo =
                          r.farol === "risco"
                            ? "bg-destructive/5"
                            : r.farol === "atencao"
                              ? "bg-warning/5"
                              : r.farol === "pausada"
                                ? ""
                                : r.tem_corte
                                  ? "bg-warning/5"
                                  : "";
                        const recente = recemExpedida(r);

                        return (
                          <Fragment key={r.codigo}>
                            <TableRow
                              className={`cursor-pointer ${fundo} ${recente ? "opacity-60" : ""}`}
                              onClick={() => setAberto(expandido ? null : r.codigo)}
                            >
                              <TableCell>
                                {expandido ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell>
                                <div
                                  className={
                                    r.pedido_display ? "font-medium" : "font-mono text-xs"
                                  }
                                >
                                  {r.pedido_display ?? r.codigo}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  XPM {r.codigo} · {r.nf_numero ? `NF ${r.nf_numero}` : "sem NF"}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[240px] truncate">
                                {r.cliente_sncf ?? r.destinatario_nome ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {r.uf_display ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    r.canal === "B2B"
                                      ? "default"
                                      : r.canal === "B2C"
                                        ? "secondary"
                                        : "outline"
                                  }
                                >
                                  {r.canal}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <CelulaSolicitado v={r.t_solicitado} />
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <Semaforo
                                      seq={Number(r.fase_seq)}
                                      emAndamentoSeq={r.fase_seq_em_andamento}
                                      temCasaEmAndamento={r.tem_casa_em_andamento}
                                      rotuloEmAndamento={r.fase_rotulo_em_andamento}
                                    />
                                    <span className="text-xs text-muted-foreground truncate">
                                      {r.fase_rotulo}
                                    </span>
                                  </div>
                                  {r.arquivo_fase_rotulo && (
                                    <span
                                      className={`text-xs truncate ${
                                        r.fonte_da_verdade === "arquivo"
                                          ? "text-warning"
                                          : "text-muted-foreground"
                                      }`}
                                      title={`Relatório em arquivo da XPM, gerado em ${
                                        r.arquivo_gerado_em
                                          ? format(new Date(r.arquivo_gerado_em), "dd/MM HH:mm", { locale: ptBR })
                                          : "data não informada"
                                      }. Fonte paralela à API.`}
                                    >
                                      XPM diz: {r.arquivo_fase_rotulo}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.quantidade_volumes ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.peso_bruto != null ? nf2.format(Number(r.peso_bruto)) : "—"}
                              </TableCell>
                              <TableCell>
                                <CelulaSla r={r} />
                              </TableCell>
                              <TableCell
                                className={`text-right tabular-nums ${
                                  atrasado
                                    ? "text-destructive font-medium"
                                    : !pausada && dias != null && dias >= 3
                                      ? "text-warning font-medium"
                                      : ""
                                }`}
                              >
                                {pausada ? <Badge variant="secondary">Pausado</Badge> : (dias ?? "—")}
                              </TableCell>
                            </TableRow>
                            {expandido && (
                              <TableRow>
                                <TableCell colSpan={11} className="p-0">
                                  <LinhaExpandida exp={r} fases={mapaFases} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageShell>
    </TooltipProvider>
  );
}
