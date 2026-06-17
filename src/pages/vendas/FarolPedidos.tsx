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
import { ChevronRight, Pause, AlertTriangle, Circle, Home, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SLA_LABEL: Record<string, string> = {
  recebido: "Recebido",
  em_analise_credito: "Análise crédito",
  cobranca: "Cobrança",
  pre_faturado: "Pré-faturamento",
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
  pre_faturado: "Pré-faturamento",
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

export default function FarolPedidos() {
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
    const internas = fases.filter(
      (f) => f.tipo_sla === "interno" && (f.sla_dias ?? 0) > 0 && f.estagio !== "em_transporte" && f.estagio !== "entregue",
    );
    const esperas = fases.filter((f) => f.tipo_sla === "espera_externa");
    const somaInternos = internas.reduce((acc, f) => acc + (f.sla_dias ?? 0), 0);
    const transporteBase = 5;
    const totalDias = somaInternos + transporteBase;
    return { internas, esperas, somaInternos, transporteBase, totalDias };
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
            <div className="text-xs font-medium text-muted-foreground lowercase">régua de prazos</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              Meta = data prometida, fixada quando o pedido chega aqui · ETA = previsão atual, recalculada conforme o pedido avança
            </div>
          </div>

          {/* Bloco 1: preparação interna */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground lowercase">
              <Home className="h-3.5 w-3.5" /> preparação · na nossa casa
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {regua.internas.map((f, idx) => (
                <span key={f.estagio} className="flex items-center gap-1.5">
                  <span className="inline-flex flex-col items-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900">
                    <span className="text-[12px] leading-tight lowercase">{SLA_LABEL[f.estagio]}</span>
                    <span className="text-[11px] leading-tight opacity-80">{f.sla_dias} d.u.</span>
                  </span>
                  {idx < regua.internas.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
          </div>

          {/* Bloco 2: logística WNS/XPM */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground lowercase">
              <Package className="h-3.5 w-3.5" /> logística · WNS / XPM
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex flex-col items-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900">
                <span className="text-[12px] leading-tight lowercase">Separando</span>
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex flex-col items-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900">
                <span className="text-[12px] leading-tight lowercase">Conferido / NF</span>
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex flex-col items-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900">
                <span className="text-[12px] leading-tight lowercase">Expedido</span>
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex flex-col items-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900">
                <span className="text-[12px] leading-tight lowercase">Em trânsito</span>
                <span className="text-[11px] leading-tight opacity-80">~5 d.u. (base · real por CEP)</span>
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex flex-col items-start rounded-md border border-green-200 bg-green-50 px-2 py-1 text-green-800 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900">
                <span className="text-[12px] leading-tight lowercase">Entregue ✓</span>
              </span>
            </div>
          </div>

          <div className="text-[13px] text-muted-foreground lowercase pt-1">
            prazo base ≈ {regua.totalDias} d.u. = {regua.somaInternos} internos + {regua.transporteBase} de transporte · sábados e domingos não contam
          </div>
          {regua.esperas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground lowercase">
                <Pause className="h-3 w-3" /> pausam o relógio:
              </span>
              {regua.esperas.map((f) => (
                <span key={f.estagio} className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-800 lowercase dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900">
                  {SLA_LABEL[f.estagio]}
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
