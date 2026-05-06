import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, isAfter, isBefore, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Clock, CreditCard, Wallet, AlertTriangle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FluxoInvestimentoDrillDrawer,
  type DrillFiltro,
  type EventoFluxo,
} from "@/components/financeiro/FluxoInvestimentoDrillDrawer";
import { FluxoInvestimentoGrafico } from "@/components/financeiro/FluxoInvestimentoGrafico";

function num(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function KpiCard({
  label,
  valor,
  icon: Icon,
  tone,
}: {
  label: string;
  valor: number;
  icon: any;
  tone?: "default" | "warn";
}) {
  return (
    <Card className="flex-1 min-w-[180px]">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div
          className={cn(
            "text-xl font-bold tabular-nums",
            tone === "warn" ? "text-amber-700" : "text-foreground",
          )}
        >
          {formatBRL(valor)}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FluxoFuturoInvestimento() {
  const [filtroFrente, setFiltroFrente] = useState<string>("__all__");
  const [janelaMeses, setJanelaMeses] = useState<3 | 6 | 12>(6);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFiltro, setDrawerFiltro] = useState<DrillFiltro | null>(null);

  const { data: eventos = [], isLoading } = useQuery<EventoFluxo[]>({
    queryKey: ["fluxo-futuro-investimento"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_fluxo_futuro_investimento")
        .select("*")
        .order("frente_ordem")
        .order("data_evento", { ascending: true, nullsFirst: false });
      if (error) {
        toast.error("Erro ao carregar fluxo futuro: " + error.message);
        throw error;
      }
      return (data || []).map((e: any) => ({
        ...e,
        valor: num(e.valor),
      })) as EventoFluxo[];
    },
    refetchOnWindowFocus: false,
  });

  const today = useMemo(() => new Date(), []);
  const inicioMesAtual = useMemo(() => startOfMonth(today), [today]);

  const meses = useMemo(() => {
    return Array.from({ length: janelaMeses }, (_, i) => addMonths(inicioMesAtual, i));
  }, [janelaMeses, inicioMesAtual]);

  const mesesKeys = useMemo(() => meses.map((d) => format(d, "yyyy-MM")), [meses]);
  const mesesLabels = useMemo(
    () => meses.map((d) => format(d, "MMM/yy", { locale: ptBR })),
    [meses],
  );

  // eventos filtrados por frente
  const eventosFiltrados = useMemo(() => {
    if (filtroFrente === "__all__") return eventos;
    return eventos.filter((e) => e.frente_id === filtroFrente);
  }, [eventos, filtroFrente]);

  // bucket de cada evento
  function bucketDe(e: EventoFluxo): string {
    if (e.origem === "linha_sem_data" || !e.data_evento) return "sem_data";
    const d = parseISO(e.data_evento);
    if (!(d instanceof Date) || isNaN(d.getTime())) return "sem_data";
    if (isBefore(d, inicioMesAtual)) return "vencido";
    return format(startOfMonth(d), "yyyy-MM");
  }

  // matriz: frente_id -> bucket -> total
  type FrenteRow = {
    frente_id: string;
    nome: string;
    ordem: number;
    buckets: Record<string, number>;
    total: number;
  };

  const { rows, vencidoTotal, semDataTotal, hasVencido, frentesNomes } = useMemo(() => {
    const map = new Map<string, FrenteRow>();
    let venc = 0;
    let sd = 0;
    for (const e of eventosFiltrados) {
      const b = bucketDe(e);
      if (b === "vencido") venc += e.valor;
      if (b === "sem_data") sd += e.valor;
      let row = map.get(e.frente_id);
      if (!row) {
        row = {
          frente_id: e.frente_id,
          nome: e.frente_nome,
          ordem: e.frente_ordem,
          buckets: {},
          total: 0,
        };
        map.set(e.frente_id, row);
      }
      row.buckets[b] = (row.buckets[b] || 0) + e.valor;
      row.total += e.valor;
    }
    const arr = Array.from(map.values()).sort((a, b) => a.ordem - b.ordem);
    return {
      rows: arr,
      vencidoTotal: venc,
      semDataTotal: sd,
      hasVencido: venc > 0,
      frentesNomes: arr.map((r) => r.nome),
    };
  }, [eventosFiltrados, mesesKeys]);

  // contagens auxiliares para alertas
  const alertasInfo = useMemo(() => {
    const vencidas = eventosFiltrados.filter((e) => bucketDe(e) === "vencido");
    const semData = eventosFiltrados.filter((e) => e.origem === "linha_sem_data");
    return {
      qtdVencidas: vencidas.length,
      qtdSemData: semData.length,
    };
  }, [eventosFiltrados]);

  // KPIs
  const kpis = useMemo(() => {
    const total = eventosFiltrados.reduce((a, e) => a + e.valor, 0);
    const comprometido = eventosFiltrados
      .filter((e) => e.origem === "cpr")
      .reduce((a, e) => a + e.valor, 0);
    const aComprometer = eventosFiltrados
      .filter((e) => e.origem !== "cpr")
      .reduce((a, e) => a + e.valor, 0);
    const limite30 = addMonths(today, 0);
    limite30.setDate(today.getDate() + 30);
    const prox30 = eventosFiltrados
      .filter(
        (e) =>
          e.data_evento &&
          !isBefore(parseISO(e.data_evento), today) &&
          !isAfter(parseISO(e.data_evento), limite30),
      )
      .reduce((a, e) => a + e.valor, 0);
    return { total, comprometido, aComprometer, prox30 };
  }, [eventosFiltrados, today]);

  // dados do gráfico (somente meses, sem vencido/sem_data)
  const chartData = useMemo(() => {
    return mesesKeys.map((bk, i) => {
      const row: Record<string, string | number> = { mesLabel: mesesLabels[i] };
      for (const r of rows) {
        row[r.nome] = r.buckets[bk] || 0;
      }
      return row;
    });
  }, [mesesKeys, mesesLabels, rows]);

  // totais de coluna
  const colTotais = useMemo(() => {
    const base: Record<string, number> = { vencido: 0, sem_data: 0, total: 0 };
    mesesKeys.forEach((k) => (base[k] = 0));
    for (const r of rows) {
      mesesKeys.forEach((k) => (base[k] += r.buckets[k] || 0));
      base.vencido += r.buckets.vencido || 0;
      base.sem_data += r.buckets.sem_data || 0;
      base.total += r.total;
    }
    return base;
  }, [rows, mesesKeys]);

  // max para heatmap
  const maxCelula = useMemo(() => {
    let mx = 0;
    for (const r of rows) {
      for (const k of mesesKeys) {
        if ((r.buckets[k] || 0) > mx) mx = r.buckets[k] || 0;
      }
    }
    return mx || 1;
  }, [rows, mesesKeys]);

  function bgIntensity(v: number): React.CSSProperties {
    if (!v) return {};
    const op = Math.min(0.45, 0.08 + (v / maxCelula) * 0.4);
    return { backgroundColor: `rgba(26, 74, 58, ${op})` };
  }

  function abrirDrill(filtro: DrillFiltro) {
    setDrawerFiltro(filtro);
    setDrawerOpen(true);
  }

  // eventos filtrados pelo drawer
  const eventosDrawer = useMemo(() => {
    if (!drawerFiltro) return [];
    return eventosFiltrados.filter((e) => {
      if (drawerFiltro.tipo === "vencido") return bucketDe(e) === "vencido";
      if (drawerFiltro.tipo === "sem_data") return e.origem === "linha_sem_data";
      if (drawerFiltro.frente_id && e.frente_id !== drawerFiltro.frente_id) return false;
      if (drawerFiltro.bucket && bucketDe(e) !== drawerFiltro.bucket) return false;
      return true;
    });
  }, [drawerFiltro, eventosFiltrados]);

  // frentes para combobox (todas distintas presentes nos eventos brutos)
  const frentesParaFiltro = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; ordem: number }>();
    for (const e of eventos) {
      if (!map.has(e.frente_id))
        map.set(e.frente_id, { id: e.frente_id, nome: e.frente_nome, ordem: e.frente_ordem });
    }
    return Array.from(map.values()).sort((a, b) => a.ordem - b.ordem);
  }, [eventos]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Fluxo Futuro de Investimento</h1>
        <p className="text-sm text-muted-foreground">
          Projeção de saídas de caixa por frente de investimento. Combina CPRs lançados ainda
          não pagos + linhas planejadas com data prevista.
        </p>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-24" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <KpiCard label="Total a Desembolsar" valor={kpis.total} icon={Wallet} />
          <KpiCard label="Já Comprometido" valor={kpis.comprometido} icon={CreditCard} />
          <KpiCard label="A Comprometer" valor={kpis.aComprometer} icon={Calendar} />
          <KpiCard label="Próximos 30 dias" valor={kpis.prox30} icon={Clock} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Frente:</span>
          <Select value={filtroFrente} onValueChange={setFiltroFrente}>
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {frentesParaFiltro.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">Janela:</span>
          {([3, 6, 12] as const).map((j) => (
            <Button
              key={j}
              size="sm"
              variant={janelaMeses === j ? "default" : "outline"}
              className="h-8"
              onClick={() => setJanelaMeses(j)}
            >
              {j} meses
            </Button>
          ))}
        </div>
      </div>

      {/* Alertas */}
      {(alertasInfo.qtdVencidas > 0 || alertasInfo.qtdSemData > 0) && (
        <div className="space-y-2">
          {alertasInfo.qtdVencidas > 0 && (
            <button
              onClick={() => abrirDrill({ tipo: "vencido" })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 transition text-left"
            >
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div className="flex-1 text-sm">
                <strong className="text-red-700">{alertasInfo.qtdVencidas}</strong>{" "}
                {alertasInfo.qtdVencidas === 1 ? "linha vencida" : "linhas vencidas"} (
                {formatBRL(vencidoTotal)}) sem CPR pago — ação necessária
              </div>
            </button>
          )}
          {alertasInfo.qtdSemData > 0 && (
            <button
              onClick={() => abrirDrill({ tipo: "sem_data" })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition text-left"
            >
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1 text-sm">
                <strong className="text-amber-700">{alertasInfo.qtdSemData}</strong>{" "}
                {alertasInfo.qtdSemData === 1 ? "linha sem data prevista" : "linhas sem data prevista"} (
                {formatBRL(semDataTotal)}) — totaliza mas não aparece no fluxo temporal
              </div>
            </button>
          )}
        </div>
      )}

      {/* Tabela Frente x Mês */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sem eventos futuros previstos. Cadastre linhas com data prevista de pagamento ou
              crie CPRs vinculados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-b bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10">
                      Frente
                    </th>
                    {hasVencido && (
                      <th className="text-right px-3 py-2 font-medium text-red-700">
                        Vencidos ⚠️
                      </th>
                    )}
                    {mesesLabels.map((lbl) => (
                      <th key={lbl} className="text-right px-3 py-2 font-medium capitalize">
                        {lbl}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-medium text-amber-700">
                      Sem data ⚠️
                    </th>
                    <th className="text-right px-3 py-2 font-medium bg-muted/60">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.frente_id} className="border-b">
                      <td className="px-3 py-2 font-medium sticky left-0 bg-background z-10">
                        {r.nome}
                      </td>
                      {hasVencido && (
                        <td
                          className={cn(
                            "text-right px-3 py-2 tabular-nums",
                            (r.buckets.vencido || 0) > 0 &&
                              "text-red-700 font-medium cursor-pointer hover:underline",
                          )}
                          onClick={() =>
                            (r.buckets.vencido || 0) > 0 &&
                            abrirDrill({
                              frente_id: r.frente_id,
                              frente_nome: r.nome,
                              bucket: "vencido",
                              bucketLabel: "Vencidos",
                              tipo: "celula",
                            })
                          }
                        >
                          {r.buckets.vencido ? formatBRL(r.buckets.vencido) : "—"}
                        </td>
                      )}
                      {mesesKeys.map((k, i) => {
                        const v = r.buckets[k] || 0;
                        return (
                          <td
                            key={k}
                            className={cn(
                              "text-right px-3 py-2 tabular-nums",
                              v > 0 && "cursor-pointer hover:ring-1 hover:ring-primary/30",
                            )}
                            style={bgIntensity(v)}
                            onClick={() =>
                              v > 0 &&
                              abrirDrill({
                                frente_id: r.frente_id,
                                frente_nome: r.nome,
                                bucket: k,
                                bucketLabel: mesesLabels[i],
                                tipo: "celula",
                              })
                            }
                          >
                            {v ? formatBRL(v) : "—"}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "text-right px-3 py-2 tabular-nums",
                          (r.buckets.sem_data || 0) > 0 &&
                            "text-amber-700 cursor-pointer hover:underline",
                        )}
                        onClick={() =>
                          (r.buckets.sem_data || 0) > 0 &&
                          abrirDrill({
                            frente_id: r.frente_id,
                            frente_nome: r.nome,
                            bucket: "sem_data",
                            bucketLabel: "Sem data",
                            tipo: "celula",
                          })
                        }
                      >
                        {r.buckets.sem_data ? formatBRL(r.buckets.sem_data) : "—"}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-semibold bg-muted/40">
                        {formatBRL(r.total)}
                      </td>
                    </tr>
                  ))}
                  {/* Total */}
                  <tr className="border-t-2" style={{ backgroundColor: "#1A4A3A" }}>
                    <td className="px-3 py-2.5 font-bold text-white sticky left-0 z-10" style={{ backgroundColor: "#1A4A3A" }}>
                      TOTAL
                    </td>
                    {hasVencido && (
                      <td className="text-right px-3 py-2.5 tabular-nums font-bold text-white">
                        {colTotais.vencido ? formatBRL(colTotais.vencido) : "—"}
                      </td>
                    )}
                    {mesesKeys.map((k) => (
                      <td
                        key={k}
                        className="text-right px-3 py-2.5 tabular-nums font-bold text-white"
                      >
                        {colTotais[k] ? formatBRL(colTotais[k]) : "—"}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2.5 tabular-nums font-bold text-white">
                      {colTotais.sem_data ? formatBRL(colTotais.sem_data) : "—"}
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums font-bold text-white">
                      {formatBRL(colTotais.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico */}
      {!isLoading && rows.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3 text-muted-foreground">
              Distribuição por mês
            </div>
            <FluxoInvestimentoGrafico data={chartData} frenteNomes={frentesNomes} />
          </CardContent>
        </Card>
      )}

      <FluxoInvestimentoDrillDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filtro={drawerFiltro}
        eventos={eventosDrawer}
      />
    </div>
  );
}
