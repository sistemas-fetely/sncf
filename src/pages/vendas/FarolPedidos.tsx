import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Pause, AlertTriangle, Circle, Building, Truck, CheckCircle, ArrowRight, Copy, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SLA_LABEL: Record<string, string> = {
  recebido: "Recebido",
  em_analise_credito: "Análise crédito",
  cobranca: "Cobrança",
  pre_separacao: "Pré-Separação",
  pre_faturamento: "Pré-Faturamento",
  em_separacao: "Separação",
  faturado: "Faturamento",
  em_transporte: "Transporte",
  entregue: "Entregue",
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_estoque: "Aguardando estoque",
};

const ESTAGIO_LABEL: Record<string, string> = {
  recebido: "Recebido",
  em_analise_credito: "Análise crédito",
  cobranca: "Cobrança",
  pre_separacao: "Pré-Separação",
  pre_faturamento: "Pré-Faturamento",
  em_separacao: "Separação",
  faturado: "Faturamento",
  em_transporte: "Transporte",
};

type SlaFaseRow = {
  estagio: string;
  ordem: number | null;
  tipo_sla: string | null;
  sla_dias: number | null;
  ativo: boolean | null;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

type FarolRow = {
  pedido_id: string;
  id_externo: string | null;
  cliente: string | null;
  valor_liquido: number | null;
  estagio: string | null;
  status_label: string | null;
  data_estagio: string | null;
  expedido: boolean | null;
  data_pg: string | null;
  meta: string | null;
  eta_vivo: string | null;
  dias_vs_meta: number | null;
  prazo: string | null;
  bloqueio: string | null;
  pago_apos_expedicao: boolean | null;
  fase_gargalo: string | null;
  tempo_na_fase: number | null;
  sla_fase_atual: number | null;
  sla_cor: "verde" | "amarelo" | "vermelho" | null;
  fase_logistica: string | null;
};

const PRAZO_LABEL: Record<string, string> = {
  no_prazo: "No prazo",
  atrasado: "Atrasado",
  pausado: "— pausado",
  sem_dado: "—",
};

const BLOQUEIO_LABEL: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_estoque: "Aguardando estoque",
};

function prazoBadgeClass(prazo: string | null): string {
  switch (prazo) {
    case "atrasado":
      return "bg-red-100 text-red-800 hover:bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900";
    case "no_prazo":
      return "bg-green-100 text-green-800 hover:bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900";
    case "pausado":
    case "sem_dado":
    default:
      return "bg-muted text-muted-foreground hover:bg-muted border-border";
  }
}

const BLOQUEIO_BADGE =
  "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  return DATA_FMT.format(parsed);
}

function fmtCurta(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  return DATA_CURTA.format(parsed);
}

const PRAZO_ORDER: Record<string, number> = {
  atrasado: 0,
  no_prazo: 1,
  sem_dado: 2,
  pausado: 3,
};

function AbaB2B() {
  const [busca, setBusca] = useState("");
  const [filtroPrazo, setFiltroPrazo] = useState<string>("todos");
  const [filtroBloqueio, setFiltroBloqueio] = useState<string>("todos");

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw_pedidos_farol"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedidos_farol" as any)
        .select("*");
      if (error) throw error;
      return ((data ?? []) as unknown) as FarolRow[];
    },
  });

  const rows = data ?? [];

  const { data: slaFases } = useQuery({
    queryKey: ["sla_fase_pedido", "ativo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_fase_pedido")
        .select("estagio, ordem, tipo_sla, sla_dias, ativo")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlaFaseRow[];
    },
  });

  const regua = useMemo(() => {
    const fases = (slaFases ?? []).filter((f) => f.estagio in SLA_LABEL);
    const EXCLUIR_PREP = new Set(["em_separacao", "faturado", "em_transporte", "entregue"]);
    const internas = fases.filter(
      (f) => f.tipo_sla === "interno" && (f.sla_dias ?? 0) > 0 && !EXCLUIR_PREP.has(f.estagio),
    );
    const esperas = fases.filter((f) => f.tipo_sla === "espera_externa");
    const somaInternos = internas.reduce((acc, f) => acc + (f.sla_dias ?? 0), 0);
    const logisticaBase = 8;
    const totalDias = somaInternos + logisticaBase;
    return { internas, esperas, somaInternos, logisticaBase, totalDias };
  }, [slaFases]);

  const resumo = useMemo(() => {
    const r = {
      no_prazo: { count: 0, soma: 0 },
      atrasado: { count: 0, soma: 0 },
      bloqueado: { count: 0, soma: 0 },
    };
    for (const it of rows) {
      const v = Number(it.valor_liquido ?? 0);
      if (it.prazo === "no_prazo") { r.no_prazo.count++; r.no_prazo.soma += v; }
      if (it.prazo === "atrasado") { r.atrasado.count++; r.atrasado.soma += v; }
      if (it.bloqueio) { r.bloqueado.count++; r.bloqueado.soma += v; }
    }
    return r;
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (filtroPrazo !== "todos" && (r.prazo ?? "") !== filtroPrazo) return false;
      if (filtroBloqueio !== "todos") {
        if (filtroBloqueio === "sem") {
          if (r.bloqueio) return false;
        } else if ((r.bloqueio ?? "") !== filtroBloqueio) {
          return false;
        }
      }
      if (q) {
        const hay = `${r.id_externo ?? ""} ${r.cliente ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const ba = a.bloqueio ? 1 : 0;
      const bb = b.bloqueio ? 1 : 0;
      // atrasado primeiro
      const pa = PRAZO_ORDER[a.prazo ?? ""] ?? 99;
      const pb = PRAZO_ORDER[b.prazo ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      // dentro de atrasado, por dias_vs_meta desc
      const da = a.dias_vs_meta ?? -Infinity;
      const db = b.dias_vs_meta ?? -Infinity;
      if (da !== db) return db - da;
      // bloqueados por último (em empate)
      return ba - bb;
    });
    return arr;
  }, [rows, busca, filtroPrazo, filtroBloqueio]);

  const COLS = 5;

  type CardKey = "no_prazo" | "atrasado" | "bloqueado";
  const cardAtivo: CardKey | null =
    filtroPrazo === "no_prazo" ? "no_prazo"
    : filtroPrazo === "atrasado" ? "atrasado"
    : filtroBloqueio !== "todos" && filtroBloqueio !== "sem" ? "bloqueado"
    : null;

  function toggleCard(key: CardKey) {
    if (key === "no_prazo") {
      setFiltroPrazo(filtroPrazo === "no_prazo" ? "todos" : "no_prazo");
      setFiltroBloqueio("todos");
    } else if (key === "atrasado") {
      setFiltroPrazo(filtroPrazo === "atrasado" ? "todos" : "atrasado");
      setFiltroBloqueio("todos");
    } else {
      // bloqueado: filtra qualquer bloqueio != null. Usamos um valor especial.
      if (cardAtivo === "bloqueado") {
        setFiltroBloqueio("todos");
      } else {
        setFiltroBloqueio("__qualquer__");
      }
      setFiltroPrazo("todos");
    }
  }

  // Ajuste: o filtro "__qualquer__" significa qualquer bloqueio
  const filtradasFinal = useMemo(() => {
    if (filtroBloqueio !== "__qualquer__") return filtradas;
    const q = busca.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (!r.bloqueio) return false;
      if (filtroPrazo !== "todos" && (r.prazo ?? "") !== filtroPrazo) return false;
      if (q) {
        const hay = `${r.id_externo ?? ""} ${r.cliente ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const pa = PRAZO_ORDER[a.prazo ?? ""] ?? 99;
      const pb = PRAZO_ORDER[b.prazo ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      const da = a.dias_vs_meta ?? -Infinity;
      const db = b.dias_vs_meta ?? -Infinity;
      return db - da;
    });
    return arr;
  }, [rows, busca, filtroPrazo, filtroBloqueio, filtradas]);

  const KpiCard = ({
    label, count, soma, tone, ativo, onClick, sufixo,
  }: {
    label: string; count: number; soma: number; tone: string;
    ativo: boolean; onClick: () => void; sufixo?: string;
  }) => (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition hover:border-primary ${ativo ? "border-primary ring-1 ring-primary" : ""}`}
    >
      <CardContent className="p-4">
        <div className={`text-xs font-medium lowercase ${tone}`}>{label}</div>
        <div className="text-2xl font-semibold mt-1">{count}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {BRL.format(soma)}{sufixo ? ` ${sufixo}` : ""}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif">Farol de Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento de prazo de entrega (somente leitura)
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-[13px] font-medium text-foreground lowercase">régua de prazos</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              <span className="font-medium text-primary">Meta</span> = data prometida, fixada quando o pedido chega
              {" · "}
              <span className="font-medium text-primary">ETA</span> = previsão atual, atualizada conforme o pedido avança
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            {/* Bloco 1: preparação interna */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-info font-medium">
                <Building className="h-3.5 w-3.5" /> preparação · ~{regua.somaInternos} d.u.
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {regua.internas.map((f, idx) => (
                  <span key={f.estagio} className="flex items-center gap-1.5">
                    <span
                      className="inline-flex flex-col items-start rounded-md border bg-info/10 border-info/30 text-info"
                      style={{ padding: "6px 11px" }}
                    >
                      <span className="text-[12px] leading-tight font-medium">{SLA_LABEL[f.estagio] ?? f.estagio}</span>
                      <span className="text-[11px] leading-tight opacity-75">{f.sla_dias} d.u.</span>
                    </span>
                    {idx < regua.internas.length - 1 && (
                      <ChevronRight className="h-[13px] w-[13px] text-info opacity-50" />
                    )}
                  </span>
                ))}
                <ArrowRight className="h-[18px] w-[18px] text-muted-foreground mx-0.5" />
              </div>
            </div>

            {/* Bloco 2: logística WNS/XPM */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-success font-medium">
                <Truck className="h-3.5 w-3.5" /> logística · ~8 d.u.
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "Separando", sla: "1 d.u." },
                  { label: "Conf. / NF", sla: "1 d.u." },
                  { label: "Expedido", sla: "1 d.u." },
                  { label: "Em trânsito", sla: "~5 d.u. · real por CEP" },
                ].map((c, idx) => (
                  <span key={c.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-flex flex-col items-start rounded-md border bg-success/10 border-success/30 text-success"
                      style={{ padding: "6px 11px" }}
                    >
                      <span className="text-[12px] leading-tight font-medium">{c.label}</span>
                      <span className="text-[11px] leading-tight opacity-75">{c.sla}</span>
                    </span>
                    <ChevronRight className="h-[13px] w-[13px] text-success opacity-50" />
                    {idx === 3 && null}
                  </span>
                ))}
                <span
                  className="inline-flex items-center gap-1.5 rounded-md bg-success/10 text-success font-medium"
                  style={{ padding: "7px 11px", border: "1.5px solid hsl(var(--success))" }}
                >
                  <CheckCircle className="h-[14px] w-[14px]" />
                  <span className="text-[12px] leading-tight">Entregue</span>
                </span>
              </div>
            </div>
          </div>

          <div className="text-[13px] text-muted-foreground pt-2 border-t lowercase">
            prazo base ≈ {regua.totalDias} dias úteis = {regua.somaInternos} preparação + 8 logística · sábados e domingos não contam
          </div>
          {regua.esperas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground lowercase">
                <Pause className="h-[14px] w-[14px] text-warning" /> pausam o relógio:
              </span>
              {regua.esperas.map((f) => (
                <span
                  key={f.estagio}
                  className="inline-flex items-center rounded-md border bg-warning/10 border-warning/30 text-warning px-2 py-0.5 text-[12px]"
                >
                  {SLA_LABEL[f.estagio] ?? f.estagio}
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground lowercase">dependem de terceiros, não contam no prazo</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="no prazo"
          count={resumo.no_prazo.count}
          soma={resumo.no_prazo.soma}
          tone="text-green-600 dark:text-green-400"
          ativo={cardAtivo === "no_prazo"}
          onClick={() => toggleCard("no_prazo")}
        />
        <KpiCard
          label="atrasado"
          count={resumo.atrasado.count}
          soma={resumo.atrasado.soma}
          tone="text-red-600 dark:text-red-400"
          ativo={cardAtivo === "atrasado"}
          onClick={() => toggleCard("atrasado")}
          sufixo="em risco"
        />
        <KpiCard
          label="bloqueados"
          count={resumo.bloqueado.count}
          soma={resumo.bloqueado.soma}
          tone="text-amber-600 dark:text-amber-400"
          ativo={cardAtivo === "bloqueado"}
          onClick={() => toggleCard("bloqueado")}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="buscar por número ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtroPrazo} onValueChange={setFiltroPrazo}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Prazo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">todos os prazos</SelectItem>
            <SelectItem value="no_prazo">no prazo</SelectItem>
            <SelectItem value="atrasado">atrasado</SelectItem>
            <SelectItem value="pausado">pausado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroBloqueio} onValueChange={setFiltroBloqueio}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Bloqueio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">todos os bloqueios</SelectItem>
            <SelectItem value="aguardando_pagamento">aguardando pagamento</SelectItem>
            <SelectItem value="aguardando_estoque">aguardando estoque</SelectItem>
            <SelectItem value="sem">sem bloqueio</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtradasFinal.length} pedido(s)
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-380px)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="bg-background">cliente</TableHead>
                <TableHead className="bg-background">estágio · desde</TableHead>
                <TableHead className="bg-background">prazo</TableHead>
                <TableHead className="bg-background">eta · meta</TableHead>
                <TableHead className="bg-background">situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLS }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-destructive py-8">
                    Erro ao carregar pedidos. Tente recarregar a página.
                  </TableCell>
                </TableRow>
              ) : filtradasFinal.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-muted-foreground py-10">
                    Nenhum pedido encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtradasFinal.map((r) => {
                  const dvm = r.dias_vs_meta;
                  const dvmNode =
                    dvm === null || dvm === undefined ? null
                    : dvm > 0 ? <span className="text-red-600 dark:text-red-400 font-medium">+{dvm}</span>
                    : dvm < 0 ? <span className="text-blue-600 dark:text-blue-400 font-medium">{dvm}</span>
                    : <span className="text-muted-foreground">0</span>;

                  // situação
                  let situacao: React.ReactNode = <span className="text-muted-foreground">—</span>;
                  if (r.bloqueio) {
                    situacao = (
                      <Badge variant="outline" className={BLOQUEIO_BADGE}>
                        {BLOQUEIO_LABEL[r.bloqueio] ?? r.bloqueio}
                      </Badge>
                    );
                  } else if (r.pago_apos_expedicao) {
                    situacao = (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs lowercase">
                        <AlertTriangle className="h-3.5 w-3.5" /> pago após expedição
                      </span>
                    );
                  } else if (r.sla_cor) {
                    const corClass =
                      r.sla_cor === "verde" ? "text-emerald-500"
                      : r.sla_cor === "amarelo" ? "text-amber-500"
                      : "text-red-500";
                    situacao = (
                      <span className="inline-flex items-center gap-1.5 text-xs lowercase text-muted-foreground">
                        <Circle className={`h-2.5 w-2.5 fill-current ${corClass}`} />
                        {r.tempo_na_fase ?? 0}d em {r.status_label ?? ESTAGIO_LABEL[r.estagio ?? ""] ?? "—"}
                      </span>
                    );
                  }

                  return (
                    <TableRow key={r.pedido_id}>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate">{r.cliente || "—"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{r.id_externo ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{r.status_label ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground lowercase">
                          desde {fmtCurta(r.data_estagio)}
                          {r.pago_apos_expedicao && r.data_pg ? ` · pago ${fmtCurta(r.data_pg)}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={prazoBadgeClass(r.prazo)}>
                            {PRAZO_LABEL[r.prazo ?? ""] ?? "—"}
                          </Badge>
                          {dvmNode}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs lowercase">eta {fmtCurta(r.eta_vivo)}</div>
                        <div className="text-[11px] text-muted-foreground lowercase">meta {fmtCurta(r.meta)}</div>
                      </TableCell>
                      <TableCell>{situacao}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ABA B2C — leitura pura de vw_gestao_b2c
// ════════════════════════════════════════════════════════════════════════════

type B2CRow = {
  shopify_id: string;
  order_name: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  estagio_derivado: string | null;
  alerta: string | null;
  total: number | null;
  payment_method: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  tracking_number: string | null;
  rastreio_status: string | null;
  rastreio_entregue: boolean | null;
};

const B2C_ESTAGIO_LABEL: Record<string, string> = {
  pago: "Pago",
  em_separacao: "Em separação",
  expedido: "Expedido",
  em_transito: "Em trânsito",
  entregue: "Entregue",
};

const B2C_ESTAGIO_BADGE: Record<string, string> = {
  pago: "bg-muted text-foreground border-border",
  em_separacao: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900",
  expedido: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-900",
  em_transito: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900",
  entregue: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900",
};

const B2C_ESTAGIOS = ["pago", "em_separacao", "expedido", "em_transito", "entregue"] as const;

function diasUteis(dataInicio: string | null): number {
  if (!dataInicio) return 0;
  const inicio = new Date(dataInicio);
  if (Number.isNaN(inicio.getTime())) return 0;
  const hoje = new Date();
  let count = 0;
  const cur = new Date(inicio);
  while (cur < hoje) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

type B2CSituacao = "no_prazo" | "atrasado" | "bloqueado";

function derivarSituacao(estagio: string | null, alerta: string | null, dias: number): B2CSituacao {
  if (alerta === "pago_sem_wns") return "bloqueado";
  if (estagio === "pago" && dias > 2) return "atrasado";
  if (estagio === "em_separacao" && dias > 5) return "atrasado";
  if (estagio === "expedido" && dias > 10) return "atrasado";
  return "no_prazo";
}

function AbaB2C() {
  const [busca, setBusca] = useState("");
  const [filtroEstagio, setFiltroEstagio] = useState<string | null>(null);
  const [filtroPrazo, setFiltroPrazo] = useState<B2CSituacao | null>(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["farol-b2c"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_gestao_b2c")
        .select("*")
        .not("estagio_derivado", "eq", "cancelado")
        .order("paid_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as B2CRow[];
    },
    staleTime: 60_000,
  });

  const enriquecidos = useMemo(() => {
    return pedidos.map((p) => {
      const diasDesdePago = diasUteis(p.paid_at);
      const situacao = derivarSituacao(p.estagio_derivado, p.alerta, diasDesdePago);
      return { ...p, diasDesdePago, situacao };
    });
  }, [pedidos]);

  const resumo = useMemo(() => {
    const r = {
      no_prazo: { count: 0, soma: 0 },
      atrasado: { count: 0, soma: 0 },
      bloqueado: { count: 0, soma: 0 },
    };
    for (const p of enriquecidos) {
      const v = Number(p.total ?? 0);
      r[p.situacao].count++;
      r[p.situacao].soma += v;
    }
    return r;
  }, [enriquecidos]);

  const contagensEstagio = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of enriquecidos) {
      const e = p.estagio_derivado ?? "—";
      c[e] = (c[e] ?? 0) + 1;
    }
    return c;
  }, [enriquecidos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = enriquecidos.filter((p) => {
      if (filtroEstagio && p.estagio_derivado !== filtroEstagio) return false;
      if (filtroPrazo && p.situacao !== filtroPrazo) return false;
      if (q && !(p.order_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const aAtras = a.situacao === "atrasado" ? 0 : 1;
      const bAtras = b.situacao === "atrasado" ? 0 : 1;
      if (aAtras !== bAtras) return aAtras - bAtras;
      return b.diasDesdePago - a.diasDesdePago;
    });
    return arr;
  }, [enriquecidos, busca, filtroEstagio, filtroPrazo]);

  function togglePrazo(p: B2CSituacao) {
    setFiltroPrazo(filtroPrazo === p ? null : p);
  }
  function toggleEstagio(e: string | null) {
    setFiltroEstagio(filtroEstagio === e ? null : e);
  }

  function copiarRastreio(codigo: string) {
    void navigator.clipboard.writeText(codigo);
  }

  const chipPipe = "inline-flex items-center rounded-md border bg-background px-2 py-1 text-[12px]";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif">Farol de Pedidos · B2C</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento de prazo de entrega Shopify (somente leitura)
        </p>
      </div>

      {/* régua de prazos B2C */}
      <Card>
        <CardContent className="p-4 space-y-3 bg-muted/30">
          <div>
            <div className="text-[13px] font-medium text-foreground lowercase">régua de prazos b2c</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              <span className="font-medium text-primary">Meta</span> = dias desde pagamento confirmado (T0)
              {" · "}prazo estimado inclui separação + transporte
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${chipPipe} font-medium`}>SHOPIFY</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={chipPipe}>Pago · T0</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={chipPipe}>Em separação · 1-2d</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={chipPipe}>Expedido · 1d</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={chipPipe}>Em trânsito · ~Xd CEP</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={`${chipPipe} bg-success/10 border-success/30 text-success`}>
              <CheckCircle className="h-3 w-3 mr-1" /> Entregue
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground border-t pt-2 lowercase">
            prazo base ≈ 2 dias úteis preparo + trânsito por CEP · pedidos sem WNS vinculado pausam o relógio
          </div>
          <div className="text-[11px] text-muted-foreground">
            pausam o relógio: pago_sem_wns — dependem de sincronização WNS
          </div>
        </CardContent>
      </Card>

      {/* mini-pipeline clicável */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => toggleEstagio(null)}
          className={`px-3 py-1 text-xs rounded-full border transition ${
            !filtroEstagio ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
          }`}
        >
          Todos ({enriquecidos.length})
        </button>
        {B2C_ESTAGIOS.map((e) => (
          <button
            key={e}
            onClick={() => toggleEstagio(e)}
            className={`px-3 py-1 text-xs rounded-full border transition ${
              filtroEstagio === e ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
            }`}
          >
            {B2C_ESTAGIO_LABEL[e]} ({contagensEstagio[e] ?? 0})
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card
          onClick={() => togglePrazo("no_prazo")}
          className={`cursor-pointer transition border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900 ${
            filtroPrazo === "no_prazo" ? "ring-2 ring-green-500" : ""
          }`}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium lowercase text-green-700 dark:text-green-400">no prazo</div>
            <div className="text-2xl font-semibold mt-1">{resumo.no_prazo.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{BRL.format(resumo.no_prazo.soma)}</div>
          </CardContent>
        </Card>
        <Card
          onClick={() => togglePrazo("atrasado")}
          className={`cursor-pointer transition border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900 ${
            filtroPrazo === "atrasado" ? "ring-2 ring-red-500" : ""
          }`}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium lowercase text-red-700 dark:text-red-400">atrasado</div>
            <div className="text-2xl font-semibold mt-1">{resumo.atrasado.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{BRL.format(resumo.atrasado.soma)} em risco</div>
          </CardContent>
        </Card>
        <Card
          onClick={() => togglePrazo("bloqueado")}
          className={`cursor-pointer transition border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900 ${
            filtroPrazo === "bloqueado" ? "ring-2 ring-amber-500" : ""
          }`}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium lowercase text-amber-700 dark:text-amber-400">bloqueados</div>
            <div className="text-2xl font-semibold mt-1">{resumo.bloqueado.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{BRL.format(resumo.bloqueado.soma)}</div>
          </CardContent>
        </Card>
      </div>

      {/* busca */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="buscar por número do pedido…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <div className="ml-auto text-xs text-muted-foreground">{filtrados.length} pedido(s)</div>
      </div>

      {/* tabela */}
      <Card className="overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-380px)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="bg-background">pedido</TableHead>
                <TableHead className="bg-background">estágio · desde</TableHead>
                <TableHead className="bg-background">dias</TableHead>
                <TableHead className="bg-background">valor</TableHead>
                <TableHead className="bg-background">pagamento</TableHead>
                <TableHead className="bg-background">rastreio</TableHead>
                <TableHead className="bg-background">status rastreio</TableHead>
                <TableHead className="bg-background">situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Carregando pedidos B2C...
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    {pedidos.length === 0
                      ? "Nenhum pedido B2C ativo."
                      : "Nenhum pedido encontrado para os filtros selecionados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((p) => {
                  const estagio = p.estagio_derivado ?? "";
                  const badgeCls = B2C_ESTAGIO_BADGE[estagio] ?? "bg-muted text-muted-foreground border-border";
                  const dataRef = estagio === "pago" || estagio === "em_separacao" ? p.paid_at : p.fulfilled_at;
                  return (
                    <TableRow key={p.shopify_id}>
                      <TableCell>
                        <div className="font-semibold">{p.order_name ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[p.shipping_city, p.shipping_province].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeCls}>
                          {B2C_ESTAGIO_LABEL[estagio] ?? estagio ?? "—"}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground lowercase mt-1">
                          desde {fmtCurta(dataRef)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-lg font-semibold">{p.diasDesdePago}</div>
                        <div className="text-[10px] text-muted-foreground lowercase">d.u. desde pgto</div>
                      </TableCell>
                      <TableCell>{BRL.format(Number(p.total ?? 0))}</TableCell>
                      <TableCell className="text-xs">{p.payment_method ?? "—"}</TableCell>
                      <TableCell>
                        {p.tracking_number ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{p.tracking_number}</span>
                            <button
                              onClick={() => copiarRastreio(p.tracking_number!)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Copiar código"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href="https://rastreamento.correios.com.br/app/index.php"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              title="Abrir Correios"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.rastreio_entregue ? (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900">
                            Entregue
                          </Badge>
                        ) : p.rastreio_status ? (
                          <span className="text-xs text-muted-foreground truncate block max-w-[180px]">
                            {p.rastreio_status.slice(0, 30)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.situacao === "atrasado" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Circle className="h-2.5 w-2.5 fill-current text-red-500" />
                            {p.diasDesdePago}d sem avanço
                          </span>
                        ) : p.situacao === "bloqueado" ? (
                          <Badge variant="outline" className={BLOQUEIO_BADGE}>Sem WNS</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Circle className="h-2.5 w-2.5 fill-current text-emerald-500" />
                            no prazo
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE RAIZ — tabs B2B / B2C
// ════════════════════════════════════════════════════════════════════════════
export default function FarolPedidos() {
  const [aba, setAba] = useState<"b2b" | "b2c">("b2b");

  return (
    <div>
      <div className="flex gap-1 border-b px-6 pt-4">
        {(["b2b", "b2c"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              aba === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setAba(t)}
          >
            {t === "b2b" ? "B2B" : "B2C"}
          </button>
        ))}
      </div>
      {aba === "b2b" ? <AbaB2B /> : <AbaB2C />}
    </div>
  );
}
