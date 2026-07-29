import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell } from "recharts";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PCT = (v: number | null | undefined) =>
  v == null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}%`;

function corPct(pct: number | null | undefined): "verde" | "ambar" | "vermelho" | "neutro" {
  if (pct == null) return "neutro";
  if (pct >= 80) return "verde";
  if (pct >= 60) return "ambar";
  return "vermelho";
}
const CLASSE_COR: Record<string, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  ambar: "text-amber-600 dark:text-amber-400",
  vermelho: "text-red-600 dark:text-red-400",
  neutro: "text-muted-foreground",
};
const CLASSE_BG: Record<string, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  vermelho: "bg-red-500",
  neutro: "bg-muted-foreground/40",
};

// ─── Card KPI ──────────────────────────────────────────────
function KpiCard({
  titulo,
  destaque,
  destaqueClasse,
  secundario,
  rotape,
  rotule,
}: {
  titulo: string;
  destaque: React.ReactNode;
  destaqueClasse?: string;
  secundario?: React.ReactNode;
  rotape?: React.ReactNode;
  rotule?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        {rotule && <p className="text-xs text-muted-foreground/70">{rotule}</p>}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${destaqueClasse ?? ""}`}>{destaque}</div>
        {secundario && <div className="text-sm text-muted-foreground mt-1">{secundario}</div>}
        {rotape && <div className="text-xs text-muted-foreground/70 mt-1">{rotape}</div>}
      </CardContent>
    </Card>
  );
}

// ─── LINHA 1: cards ─────────────────────────────────────────
function LinhaCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-cards"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_cards")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (!data) {
    return <div className="text-sm text-muted-foreground">Sem dados.</div>;
  }

  const slaCor = corPct(data.pct_sla_interno);
  const travados = Number(data.travados_qtd ?? 0) > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        titulo="Em carteira"
        destaque={BRL.format(Number(data.ativos_valor ?? 0))}
        secundario={`${data.ativos_qtd ?? 0} pedidos`}
      />
      <KpiCard
        titulo="Lead time"
        rotule="recebido → entregue"
        destaque={`${NUM.format(Number(data.lead_time_mediana ?? 0))} d`}
        secundario={`média ${NUM.format(Number(data.lead_time_medio ?? 0))} d`}
        rotape={`n=${data.lead_time_n ?? 0}`}
      />
      <KpiCard
        titulo="SLA interno"
        rotule="só o que é nosso"
        destaque={<span className={CLASSE_COR[slaCor]}>{PCT(data.pct_sla_interno)}</span>}
        rotape={`${data.sla_passagens ?? 0} passagens`}
      />
      <KpiCard
        titulo="Travados"
        destaque={
          <span className={travados ? "text-red-600 dark:text-red-400" : ""}>
            {data.travados_qtd ?? 0}
          </span>
        }
        secundario={
          <span className={travados ? "text-red-600 dark:text-red-400" : ""}>
            {BRL.format(Number(data.travados_valor ?? 0))}
          </span>
        }
      />
      <KpiCard
        titulo="Cancelamento"
        destaque={PCT(data.taxa_cancelamento)}
      />
    </div>
  );
}

// ─── LINHA 2: SLA por fase ─────────────────────────────────
type SlaFaseRow = {
  fase: string;
  ordem_fase: number | null;
  tipo_sla: "interno" | "espera_externa" | "transito" | string;
  alvo_mensuravel: boolean | null;
  alvo: number | null;
  alvo_em_dias_uteis: boolean | null;
  mediana: number | null;
  media: number | null;
  pct_no_alvo: number | null;
  pior: number | null;
  parados_agora: number | null;
  valor_parado: number | null;
  responsavel: string | null;
  fonte_prazo: string | null;
  amostra_suficiente: boolean | null;
};

function BarraPct({ pct }: { pct: number | null | undefined }) {
  const cor = corPct(pct);
  const val = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded overflow-hidden">
        <div className={`h-full ${CLASSE_BG[cor]}`} style={{ width: `${val}%` }} />
      </div>
      <span className={`text-sm ${CLASSE_COR[cor]}`}>{PCT(pct)}</span>
    </div>
  );
}

function LinhaSlaFase() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-sla-fase"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_sla_fase")
        .select("*");
      if (error) throw error;
      return (data ?? []) as SlaFaseRow[];
    },
  });

  const internos = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.tipo_sla === "interno" && r.alvo_mensuravel === true)
        .sort((a, b) => (a.ordem_fase ?? 0) - (b.ordem_fase ?? 0)),
    [data]
  );
  const externos = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.tipo_sla === "espera_externa" || r.tipo_sla === "transito")
        .sort((a, b) => (a.ordem_fase ?? 0) - (b.ordem_fase ?? 0)),
    [data]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">SLA interno — responsabilidade Fetély</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : internos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem fases internas mensuráveis.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fase</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Mediana</TableHead>
                  <TableHead>Média</TableHead>
                  <TableHead>% no alvo</TableHead>
                  <TableHead>Pior</TableHead>
                  <TableHead>Parados agora</TableHead>
                  <TableHead>Valor parado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {internos.map((r) => {
                  const insuf = r.amostra_suficiente === false;
                  return (
                    <TableRow key={r.fase} className={insuf ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {r.fase}
                        {insuf && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            amostra insuficiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.alvo != null
                          ? `${r.alvo} d${r.alvo_em_dias_uteis ? " úteis" : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>{r.mediana != null ? NUM.format(r.mediana) : "—"}</TableCell>
                      <TableCell>{r.media != null ? NUM.format(r.media) : "—"}</TableCell>
                      <TableCell>
                        {insuf ? (
                          <span className="text-muted-foreground text-sm">{PCT(r.pct_no_alvo)}</span>
                        ) : (
                          <BarraPct pct={r.pct_no_alvo} />
                        )}
                      </TableCell>
                      <TableCell>{r.pior != null ? NUM.format(r.pior) : "—"}</TableCell>
                      <TableCell>{r.parados_agora ?? 0}</TableCell>
                      <TableCell>{BRL.format(Number(r.valor_parado ?? 0))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Não é nosso tempo — espera externa e trânsito</CardTitle>
          <p className="text-xs text-muted-foreground">
            Prazo depende de cliente, fornecedor ou transportadora — por isso não recebe nota.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : externos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem fases externas.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fase</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Fonte do prazo</TableHead>
                  <TableHead>Mediana</TableHead>
                  <TableHead>Média</TableHead>
                  <TableHead>Pior</TableHead>
                  <TableHead>Parados agora</TableHead>
                  <TableHead>Valor parado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externos.map((r) => (
                  <TableRow key={r.fase}>
                    <TableCell className="font-medium">{r.fase}</TableCell>
                    <TableCell>{r.responsavel ?? "—"}</TableCell>
                    <TableCell>{r.fonte_prazo ?? "—"}</TableCell>
                    <TableCell>{r.mediana != null ? NUM.format(r.mediana) : "—"}</TableCell>
                    <TableCell>{r.media != null ? NUM.format(r.media) : "—"}</TableCell>
                    <TableCell>{r.pior != null ? NUM.format(r.pior) : "—"}</TableCell>
                    <TableCell>{r.parados_agora ?? 0}</TableCell>
                    <TableCell>{BRL.format(Number(r.valor_parado ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── LINHA 3: funil por valor ───────────────────────────────
type FunilRow = {
  fase: string;
  ordem_fase: number | null;
  tipo_sla: string | null;
  pedidos: number | null;
  valor: number | null;
};

function LinhaFunil() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-funil"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_funil")
        .select("*");
      if (error) throw error;
      return (data ?? []) as FunilRow[];
    },
  });

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((r) => (r.pedidos ?? 0) > 0)
        .sort((a, b) => (a.ordem_fase ?? 0) - (b.ordem_fase ?? 0)),
    [data]
  );
  const max = Math.max(1, ...rows.map((r) => Number(r.valor ?? 0)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funil por valor</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem pedidos ativos.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const val = Number(r.valor ?? 0);
              const pct = (val / max) * 100;
              let cor = "bg-muted-foreground/30";
              if (r.tipo_sla === "interno") cor = "bg-primary";
              else if (r.tipo_sla === "espera_externa" || r.tipo_sla === "transito")
                cor = "bg-muted-foreground/50";
              else if (r.tipo_sla === "terminal") cor = "bg-muted-foreground/20";
              return (
                <div key={r.fase} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{r.fase}</span>
                    <span>
                      {BRL.format(val)}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({r.pedidos} pedidos)
                      </span>
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── LINHA 4: problemas em aberto ──────────────────────────
type ProblemaRow = {
  tipo: string;
  prioridade_grupo: number | null;
  pedido_id: string;
  id_externo: string | null;
  cliente: string | null;
  fase: string | null;
  valor_liquido: number | null;
  dias_na_fase: number | null;
  alvo: number | null;
  indice_exposicao: number | null;
  detalhe: string | null;
  acao: string | null;
};

function LinhaProblemas() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-problemas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_problemas")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ProblemaRow[];
    },
  });

  const grupos = useMemo(() => {
    const m = new Map<string, { prioridade: number; rows: ProblemaRow[]; total: number }>();
    for (const r of data ?? []) {
      const g = m.get(r.tipo) ?? { prioridade: r.prioridade_grupo ?? 999, rows: [], total: 0 };
      g.rows.push(r);
      g.total += Number(r.valor_liquido ?? 0);
      m.set(r.tipo, g);
    }
    return Array.from(m.entries())
      .map(([tipo, v]) => ({
        tipo,
        prioridade: v.prioridade,
        total: v.total,
        rows: v.rows.sort(
          (a, b) => Number(b.indice_exposicao ?? 0) - Number(a.indice_exposicao ?? 0)
        ),
      }))
      .sort((a, b) => a.prioridade - b.prioridade);
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Para cobrar hoje</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : grupos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nada em aberto.</div>
        ) : (
          <TooltipProvider>
            <div className="space-y-6">
              {grupos.map((g) => (
                <div key={g.tipo}>
                  <div className="flex items-baseline justify-between mb-2 pb-1 border-b">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-semibold text-sm">{g.tipo}</h3>
                      <Badge variant="secondary">{g.rows.length}</Badge>
                    </div>
                    <span className="text-sm font-medium">{BRL.format(g.total)}</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fase</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Dias na fase</TableHead>
                        <TableHead>Alvo</TableHead>
                        <TableHead>
                          <Tooltip>
                            <TooltipTrigger className="cursor-help underline decoration-dotted">
                              índice
                            </TooltipTrigger>
                            <TooltipContent>
                              dias × valor — serve para ordenar, não é dinheiro
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead>Detalhe</TableHead>
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow
                          key={r.pedido_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/pedidos/${r.pedido_id}`)}
                        >
                          <TableCell className="font-mono text-xs">
                            {r.id_externo ?? r.pedido_id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{r.cliente ?? "—"}</TableCell>
                          <TableCell>{r.fase ?? "—"}</TableCell>
                          <TableCell>{BRL.format(Number(r.valor_liquido ?? 0))}</TableCell>
                          <TableCell>{r.dias_na_fase ?? "—"}</TableCell>
                          <TableCell>{r.alvo ?? "—"}</TableCell>
                          <TableCell>
                            {r.indice_exposicao != null
                              ? NUM.format(Number(r.indice_exposicao))
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                            {r.detalhe ?? "—"}
                          </TableCell>
                          <TableCell className="font-medium">{r.acao ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

// ─── LINHA 5: negócio (ticket / condição / concentração) ────
type TicketRow = { faixa: string; ordem: number | null; pedidos: number | null; valor: number | null };
type CondicaoRow = {
  condicao: string;
  a_vista: boolean | null;
  pedidos: number | null;
  valor: number | null;
};
type ConcentracaoRow = {
  cliente: string | null;
  pedidos_ativos: number | null;
  valor_em_aberto: number | null;
};

function BlocoTicket() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-ticket"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_ticket")
        .select("*");
      if (error) throw error;
      return (data ?? []) as TicketRow[];
    },
  });

  const rows = useMemo(
    () => (data ?? []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ticket</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <XAxis dataKey="faixa" fontSize={11} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => BRL.format(Number(v)).replace(/\s/g, "")}
                  width={80}
                />
                <RTooltip
                  formatter={(v: any, _n, p: any) => [
                    BRL.format(Number(v)),
                    `${p.payload.pedidos} pedidos`,
                  ]}
                />
                <Bar dataKey="valor" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoMix() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-condicao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_condicao")
        .select("*");
      if (error) throw error;
      return (data ?? []) as CondicaoRow[];
    },
  });

  const { aVista, aPrazo, total } = useMemo(() => {
    let av = 0;
    let ap = 0;
    for (const r of data ?? []) {
      const v = Number(r.valor ?? 0);
      if (r.a_vista) av += v;
      else ap += v;
    }
    return { aVista: av, aPrazo: ap, total: av + ap };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Mix da carteira</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : total === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <>
            <div className="flex h-6 rounded overflow-hidden mb-3">
              <div
                className="bg-primary"
                style={{ width: `${(aVista / total) * 100}%` }}
                title={`À vista / portão: ${BRL.format(aVista)}`}
              />
              <div
                className="bg-muted-foreground/50"
                style={{ width: `${(aPrazo / total) * 100}%` }}
                title={`A prazo: ${BRL.format(aPrazo)}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <div className="text-xs text-muted-foreground">À vista / portão</div>
                <div className="font-medium">
                  {BRL.format(aVista)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({PCT((aVista / total) * 100)})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">A prazo</div>
                <div className="font-medium">
                  {BRL.format(aPrazo)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({PCT((aPrazo / total) * 100)})
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t pt-2 max-h-40 overflow-auto">
              {(data ?? [])
                .slice()
                .sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0))
                .map((r) => (
                  <div
                    key={r.condicao}
                    className="flex items-baseline justify-between text-xs py-1"
                  >
                    <span className="truncate">{r.condicao}</span>
                    <span className="text-muted-foreground">{BRL.format(Number(r.valor ?? 0))}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoConcentracao() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-pedidos-concentracao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dash_pedidos_concentracao")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ConcentracaoRow[];
    },
  });

  const { top10, pctTop3 } = useMemo(() => {
    const rows = (data ?? [])
      .slice()
      .sort((a, b) => Number(b.valor_em_aberto ?? 0) - Number(a.valor_em_aberto ?? 0));
    const total = rows.reduce((s, r) => s + Number(r.valor_em_aberto ?? 0), 0);
    const top3 = rows.slice(0, 3).reduce((s, r) => s + Number(r.valor_em_aberto ?? 0), 0);
    return {
      top10: rows.slice(0, 10),
      pctTop3: total > 0 ? (top3 / total) * 100 : null,
    };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Concentração</CardTitle>
        {pctTop3 != null && (
          <p className="text-xs text-muted-foreground">
            Top 3 = {PCT(pctTop3)} do total em aberto
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : top10.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top10.map((r, i) => (
                <TableRow key={(r.cliente ?? "") + i}>
                  <TableCell className="truncate max-w-[200px]">{r.cliente ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.pedidos_ativos ?? 0}</TableCell>
                  <TableCell className="text-right">
                    {BRL.format(Number(r.valor_em_aberto ?? 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página ────────────────────────────────────────────────
export default function DashPedidos() {
  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-serif">Dash de Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Visão viva da carteira, do SLA e do que precisa ser cobrado hoje.
        </p>
      </header>

      <LinhaCards />
      <LinhaSlaFase />
      <LinhaFunil />
      <LinhaProblemas />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BlocoTicket />
        <BlocoMix />
        <BlocoConcentracao />
      </div>
    </div>
  );
}
