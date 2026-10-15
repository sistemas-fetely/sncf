import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Coins, Gauge, Percent, RefreshCw, Receipt, Scale, TrendingDown, TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  useLogisticaPainel, type EscopoPainel, type PainelAlimentacao, type PainelTransportadora,
} from "@/hooks/logistica/useLogisticaPainel";
import { ROTULO_FONTE_CUSTO, ROTULO_MODO_CUSTO, ROTULO_MODO_RASTREIO } from "@/lib/logistica/perfilRotulos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");
const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const brl = (v: number | null | undefined) => (v == null ? "—" : BRL.format(Number(v)));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${PCT.format(Number(v))}%`);

type Periodo = "3m" | "6m" | "12m" | "ano";
const PERIODOS: { v: Periodo; l: string }[] = [
  { v: "3m", l: "3 meses" }, { v: "6m", l: "6 meses" }, { v: "12m", l: "12 meses" }, { v: "ano", l: "Ano" },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function intervalo(p: Periodo): { de: string; ate: string } {
  const hoje = new Date();
  const n = p === "3m" ? 3 : p === "6m" ? 6 : 12;
  const de = p === "ano" ? new Date(hoje.getFullYear(), 0, 1) : new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1), 1);
  return { de: iso(de), ate: iso(hoje) };
}
function dataBr(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-BR");
}
function mesBr(m: string) {
  const [a, mm] = m.split("-");
  return mm ? `${mm}/${a}` : m;
}
function minutosDesde(v: string | undefined) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60000));
}
function diasDesde(v: string | null) {
  if (!v) return null;
  const t = new Date(v.length <= 10 ? `${v}T12:00:00` : v).getTime();
  return Number.isNaN(t) ? null : (Date.now() - t) / 86400000;
}

interface Props { escopo: EscopoPainel; mostrarPorTransportadora?: boolean }

export function PainelRemessas({ escopo, mostrarPorTransportadora }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("6m");
  const datas = useMemo(() => intervalo(periodo), [periodo]);
  const { data, isLoading, error, refetch, isFetching } = useLogisticaPainel({ ...escopo, ...datas });
  const min = minutosDesde(data?.escopo.gerado_em);

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((p) => (
          <button
            key={p.v}
            onClick={() => setPeriodo(p.v)}
            className={cn(
              "rounded-full px-3 py-1 text-xs border transition",
              periodo === p.v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border",
            )}
          >
            {p.l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {min != null && <span>atualizado há {min} min</span>}
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar painel">
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertTriangle className="h-4 w-4" /> Não foi possível carregar o painel
          </div>
          <p className="text-sm">{error instanceof Error ? error.message : "Painel de logística voltou vazio do banco."}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  if (!k.remessas) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          Nenhuma remessa no período.
        </div>
      </div>
    );
  }

  const fontes = [
    k.custo_fatura > 0 ? `fatura ${brl(k.custo_fatura)}` : null,
    k.custo_api > 0 ? `API ${brl(k.custo_api)}` : null,
    k.custo_postagem > 0 ? `postagem ${brl(k.custo_postagem)}` : null,
  ].filter(Boolean).join(" · ");
  const cob = k.cobertura_custo_pct;
  const cobVar = cob == null ? "default" : cob < 75 ? "destructive" : cob < 90 ? "warning" : "success";

  return (
    <div className="space-y-6">
      {cabecalho}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Resultado do frete</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard title="Frete cobrado" value={brl(k.receita_frete)} icon={Receipt}
            subtitle={`${NUM.format(k.remessas_com_frete_cobrado)} de ${NUM.format(k.pedidos)} remessas cobram frete`} />
          <StatCard title="Custo real" value={brl(k.custo_frete)} icon={Coins} subtitle={fontes || undefined} />
          <StatCard title="Resultado" value={brl(k.margem)} icon={k.margem < 0 ? TrendingDown : TrendingUp}
            variant={k.margem < 0 ? "destructive" : "success"}
            subtitle={k.margem < 0 ? "subsídio que a Fetely banca" : undefined} />
          <StatCard title="Recuperação" value={pct(k.recuperacao_pct)} icon={Percent} subtitle="frete cobrado ÷ custo real" />
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger asChild>
                <div>
                  <StatCard title="Cobertura do custo" value={pct(cob)} icon={Gauge} variant={cobVar}
                    subtitle={`${NUM.format(k.remessas_com_custo_real)} de ${NUM.format(k.pedidos)} remessas com custo real`} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Remessas sem custo real ainda: estimativa de {brl(k.custo_estimado_sem_real)}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
          <StatCard title="Peso do subsídio" value={pct(k.subsidio_sobre_venda_pct)} icon={Scale}
            subtitle={`frete cobrado = ${pct(k.frete_cobrado_sobre_venda_pct)} da venda`} />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h3 className="text-sm font-medium">Evolução mensal</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.serie_mensal.map((s) => ({ ...s, mesLabel: mesBr(s.mes) }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => NUM.format(v)} />
              <Tooltip formatter={(v: number) => BRL.format(v)} />
              <Legend />
              <Bar dataKey="receita" name="Frete cobrado" fill="hsl(var(--primary))" />
              <Bar dataKey="custo" name="Custo real" fill="hsl(var(--muted-foreground))" />
              <Line dataKey="margem" name="Resultado" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {data.serie_mensal
            .filter((s) => s.cobertura_custo_pct != null && s.cobertura_custo_pct < 90)
            .map((s) => <span key={s.mes}>{mesBr(s.mes)}: cobertura {pct(s.cobertura_custo_pct)}</span>)}
        </div>
      </section>

      {mostrarPorTransportadora !== false && <PorTransportadora linhas={data.por_transportadora} />}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Entregas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Mini l="Entregues" v={NUM.format(data.entrega.entregues)} />
          <Mini l="Em trânsito" v={NUM.format(data.entrega.em_transito)} />
          <Mini l="Atenção" v={NUM.format(data.entrega.atencao)} tom="warning" />
          <Mini l="Devolução" v={NUM.format(data.entrega.devolucao)} tom="destructive" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Mini l="OTD" v={data.entrega.mensuraveis ? pct(data.entrega.otd_pct) : "—"}
            s={`${NUM.format(data.entrega.mensuraveis)} mensuráveis`} />
          <Mini l="Prazo médio" v={data.entrega.prazo_medio_dias == null ? "—" : `${PCT.format(data.entrega.prazo_medio_dias)} dias`} />
          <Mini l="Valor em trânsito" v={brl(data.entrega.valor_em_transito)} />
        </div>
      </section>

      <PorUf linhas={data.por_uf} />
      <Alimentacao linhas={data.alimentacao} />
    </div>
  );
}

function Mini({ l, v, s, tom }: { l: string; v: string; s?: string; tom?: "warning" | "destructive" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3",
      tom === "warning" && "border-warning/40", tom === "destructive" && "border-destructive/40")}>
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className="text-xl font-medium tabular-nums">{v}</div>
      {s && <div className="text-xs text-muted-foreground">{s}</div>}
    </div>
  );
}

type ColT = "transportadora" | "canal" | "remessas" | "receita" | "custo" | "margem" | "recuperacao" | "cobertura";
const valorCol: Record<ColT, (r: PainelTransportadora) => string | number | null> = {
  transportadora: (r) => r.transportadora, canal: (r) => r.canal, remessas: (r) => r.remessas,
  receita: (r) => r.receita, custo: (r) => r.custo, margem: (r) => r.margem,
  recuperacao: (r) => r.recuperacao_pct, cobertura: (r) => r.cobertura_custo_pct,
};

function PorTransportadora({ linhas }: { linhas: PainelTransportadora[] }) {
  const [sort, setSort] = useState<SortState<ColT> | null>(null);
  const [, setParams] = useSearchParams();
  const mobile = useIsMobile();

  const ordenadas = useMemo(() => {
    const com = linhas.filter((l) => l.transportadora_id);
    const sem = linhas.filter((l) => !l.transportadora_id);
    if (sort) {
      const f = valorCol[sort.column];
      const d = sort.direction === "asc" ? 1 : -1;
      com.sort((a, b) => {
        const va = f(a), vb = f(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * d;
      });
    }
    return [...com, ...sem];
  }, [linhas, sort]);

  const abrir = (id: string | null) => {
    if (!id) return;
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("transportadora", id);
      n.delete("aba");
      return n;
    });
  };

  const cobertura = (r: PainelTransportadora) => (
    <div>
      <div className="flex items-center gap-1.5 justify-end">
        <span className="tabular-nums">{pct(r.cobertura_custo_pct)}</span>
        {r.custo_fonte_dominante && (
          <Badge variant="outline" className="text-[10px]">{ROTULO_FONTE_CUSTO[r.custo_fonte_dominante]}</Badge>
        )}
      </div>
      {r.custo_cego_desde && (
        <div className="text-xs text-muted-foreground">custo cego desde {dataBr(r.custo_cego_desde)}</div>
      )}
    </div>
  );

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Por transportadora</h3>
      {mobile ? (
        <div className="grid gap-2">
          {ordenadas.map((r, i) => (
            <button key={`${r.transportadora_id}-${r.canal}-${i}`} onClick={() => abrir(r.transportadora_id)}
              disabled={!r.transportadora_id}
              className={cn("rounded-lg border bg-card p-3 text-left text-sm space-y-1", !r.transportadora_id && "text-muted-foreground")}>
              <div className="flex justify-between gap-2">
                <span className="font-medium">{r.transportadora}</span>
                <Badge variant="outline" className="text-[10px] uppercase">{r.canal}</Badge>
              </div>
              <div className="text-xs">
                {NUM.format(r.remessas)} remessas · cobrado {brl(r.receita)} · custo {brl(r.custo)} · resultado {brl(r.margem)}
              </div>
              <div className="text-xs">Recuperação {pct(r.recuperacao_pct)}</div>
              {cobertura(r)}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="transportadora" sort={sort} onSort={setSort}>Transportadora</SortableTableHead>
                <SortableTableHead column="canal" sort={sort} onSort={setSort}>Canal</SortableTableHead>
                <SortableTableHead column="remessas" sort={sort} onSort={setSort} align="right">Remessas</SortableTableHead>
                <SortableTableHead column="receita" sort={sort} onSort={setSort} align="right">Frete cobrado</SortableTableHead>
                <SortableTableHead column="custo" sort={sort} onSort={setSort} align="right">Custo real</SortableTableHead>
                <SortableTableHead column="margem" sort={sort} onSort={setSort} align="right">Resultado</SortableTableHead>
                <SortableTableHead column="recuperacao" sort={sort} onSort={setSort} align="right">Recuperação</SortableTableHead>
                <SortableTableHead column="cobertura" sort={sort} onSort={setSort} align="right">Cobertura</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.map((r, i) => (
                <TableRow key={`${r.transportadora_id}-${r.canal}-${i}`} onClick={() => abrir(r.transportadora_id)}
                  className={cn(r.transportadora_id ? "cursor-pointer" : "text-muted-foreground")}>
                  <TableCell className="font-medium">{r.transportadora}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.canal}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{NUM.format(r.remessas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.receita)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.custo)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.margem < 0 && r.transportadora_id && "text-destructive")}>{brl(r.margem)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.recuperacao_pct)}</TableCell>
                  <TableCell className="text-right">{cobertura(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function PorUf({ linhas }: { linhas: { uf: string; remessas: number; custo: number; custo_medio: number | null }[] }) {
  const top = [...linhas].sort((a, b) => b.custo - a.custo).slice(0, 10)
    .map((u) => ({ ...u, rotulo: `${u.uf} · ${NUM.format(u.remessas)} remessas · médio ${brl(u.custo_medio)}` }));
  if (!top.length) return null;
  return (
    <section className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-medium">Custo por destino</h3>
      <div style={{ height: top.length * 34 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{ left: 8 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => NUM.format(v)} />
            <YAxis type="category" dataKey="rotulo" width={260} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => BRL.format(v)} />
            <Bar dataKey="custo" name="Custo" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Alimentacao({ linhas }: { linhas: PainelAlimentacao[] }) {
  if (!linhas.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Alimentação do custo e do rastreio</h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {linhas.map((a) => {
          const atrasada = a.importa_fatura && (diasDesde(a.ultima_fatura_doc) ?? Infinity) > 30;
          return (
            <div key={a.transportadora_id} className="rounded-lg border bg-card p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{a.transportadora}</span>
                {atrasada && <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">fatura atrasada</Badge>}
              </div>
              <div className="text-xs">Custo: {ROTULO_MODO_CUSTO[a.modo_custo] ?? a.modo_custo}</div>
              <div className="text-xs">Rastreio: {ROTULO_MODO_RASTREIO[a.modo_rastreio] ?? a.modo_rastreio}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {a.ultima_fatura_doc && (
                  <div>última fatura: {dataBr(a.ultima_fatura_doc)}{a.ultima_fatura_import ? ` (importada em ${dataBr(a.ultima_fatura_import)})` : ""}</div>
                )}
                {a.ultima_api_sync && <div>API sincronizada em {dataBr(a.ultima_api_sync)}</div>}
                {a.ultima_postagem && (
                  <div>última postagem: {dataBr(a.ultima_postagem)}{a.ultima_postagem_import ? ` (importada em ${dataBr(a.ultima_postagem_import)})` : ""}</div>
                )}
              </div>
              {atrasada && a.custo_fallback === "api_cte" && (
                <div className="text-xs text-warning">custo vindo da API enquanto a fatura não chega</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
