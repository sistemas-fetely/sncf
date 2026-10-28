import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/format-currency";
import { useEstadoTela } from "@/lib/navegacao";
import { useRotaNavegavel } from "@/hooks/useFavoritos";
import {
  agruparPeriodos, canalDe, ddmm, noHorizonte, somar, toIso, valor,
  type Granularidade, type Periodo, type Recebivel,
} from "./fluxoRecebimentos";

const CORES = [1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`);
const HORIZONTES = [30, 60, 90, 180];
const GRANS: { v: Granularidade; l: string }[] = [
  { v: "dia", l: "Dia" }, { v: "semana", l: "Semana" }, { v: "mes", l: "Mês" },
];

const formatK = (v: number) =>
  Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `R$ ${Math.round(v / 1e3)}k` : `R$ ${v.toFixed(0)}`;

function hojeIso() {
  const d = new Date();
  return toIso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export default function FluxoRecebimentos() {
  const { pathname } = useLocation();
  const nav = useRotaNavegavel(pathname);
  const [estado, setEstado] = useEstadoTela({ ver: "semana", horizonte: 90, canais: "", firme: false });
  const ver = (["dia", "semana", "mes"].includes(estado.ver) ? estado.ver : "semana") as Granularidade;
  const horizonte = HORIZONTES.includes(estado.horizonte) ? estado.horizonte : 90;
  const canaisSel = useMemo(() => new Set(estado.canais ? estado.canais.split(",") : []), [estado.canais]);
  const [aberto, setAberto] = useState<Periodo | null>(null);

  const q = useQuery({
    queryKey: ["vw_fluxo_recebimento_dia_util"],
    queryFn: async (): Promise<Recebivel[]> => {
      const out: Recebivel[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await (supabase as any)
          .from("vw_fluxo_recebimento_dia_util").select("*").range(de, de + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });

  useEffect(() => {
    if (q.error) toast.error(`Erro ao carregar recebimentos: ${(q.error as Error).message}`);
  }, [q.error]);

  const hoje = hojeIso();
  const todos = q.data ?? [];
  const canaisTodos = useMemo(() => [...new Set(todos.map(canalDe))].sort(), [todos]);
  const corCanal = (c: string) => CORES[Math.max(0, canaisTodos.indexOf(c)) % CORES.length];

  const filtrados = useMemo(
    () => todos.filter((r) => (canaisSel.size === 0 || canaisSel.has(canalDe(r))) && (!estado.firme || r.eh_firme)),
    [todos, canaisSel, estado.firme],
  );
  const futuros = useMemo(() => noHorizonte(filtrados, hoje, horizonte), [filtrados, hoje, horizonte]);
  const periodos = useMemo(() => agruparPeriodos(futuros, ver), [futuros, ver]);
  const canaisVis = useMemo(() => canaisTodos.filter((c) => periodos.some((p) => p.porCanal[c])), [canaisTodos, periodos]);
  const temTaxaAusente = filtrados.some((r) => r.taxa_ausente);

  // Tela da cobrança programada A VENCER: nada atrasado entra em card, gráfico, tabela ou drawer.
  const aVencer = useMemo(() => todos.filter((r) => !r.eh_atrasado), [todos]);

  const cards = [7, 30, 90].map((d) => ({ d, ...somar(noHorizonte(filtrados, hoje, d)) }));

  const dadosGrafico = periodos.map((p) => {
    const o: Record<string, number | string> = { rotulo: p.rotulo };
    for (const c of canaisVis) {
      o[`${c}|f`] = p.firmePorCanal[c] ?? 0;
      o[`${c}|i`] = (p.porCanal[c] ?? 0) - (p.firmePorCanal[c] ?? 0);
    }
    return o;
  });

  const alternarCanal = (c: string) => {
    const s = new Set(canaisSel);
    s.has(c) ? s.delete(c) : s.add(c);
    setEstado({ canais: [...s].join(",") });
  };

  return (
    <PageShell className="min-w-0 max-w-full">
      <PageHeader
        titulo={nav?.label ?? ""}
        estado={q.data ? `${aVencer.length} recebíveis a vencer · horizonte de ${horizonte} dias` : undefined}
      />

      {q.error ? (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Não foi possível carregar os recebimentos: {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {cards.map((c, i) => (
              <Card key={c.d}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{i === 0 ? "Entra nos próximos 7 dias" : `Próximos ${c.d} dias`}</p>
                  {q.isLoading ? <Skeleton className="mt-2 h-7 w-28" /> : (
                    <>
                      <p className="mt-1 truncate text-xl font-semibold md:text-2xl">{formatBRL(c.total)}</p>
                      <p className="text-xs text-muted-foreground">{formatBRL(c.firme)} firme</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Controles */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-md border">
              {GRANS.map((g) => (
                <Button key={g.v} size="sm" variant={ver === g.v ? "default" : "ghost"} className="rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => setEstado({ ver: g.v })}>{g.l}</Button>
              ))}
            </div>
            <div className="flex rounded-md border">
              {HORIZONTES.map((h) => (
                <Button key={h} size="sm" variant={horizonte === h ? "default" : "ghost"} className="rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => setEstado({ horizonte: h })}>{h} dias</Button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">Canal{canaisSel.size ? ` (${canaisSel.size})` : ": todos"}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-2">
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {canaisTodos.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={canaisSel.has(c)} onCheckedChange={() => alternarCanal(c)} />
                      <span className="truncate">{c}</span>
                    </label>
                  ))}
                </div>
                {canaisSel.size > 0 && (
                  <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setEstado({ canais: "" })}>Limpar</Button>
                )}
              </PopoverContent>
            </Popover>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={estado.firme} onCheckedChange={(v) => setEstado({ firme: v })} /> Só firme
            </label>
          </div>

          {temTaxaAusente && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Há cartão com taxa da adquirente não informada — valor líquido = bruto.
            </p>
          )}

          {/* Gráfico */}
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Entradas por {GRANS.find((g) => g.v === ver)!.l.toLowerCase()}</CardTitle>
              <p className="text-xs text-muted-foreground">Cor cheia = firme · cor clara = incerto (a vencer).</p>
            </CardHeader>
            <CardContent className="h-72 min-w-0">
              {q.isLoading ? <Skeleton className="h-full w-full" /> : periodos.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum recebimento previsto neste horizonte com esses filtros.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} width={60} />
                    <RTooltip
                      formatter={(v: number, k: string) => [formatBRL(v), `${k.split("|")[0]} · ${k.endsWith("|f") ? "firme" : "incerto"}`]}
                    />
                    <Legend formatter={(k: string) => (k.endsWith("|f") ? k.split("|")[0] : `${k.split("|")[0]} (incerto)`)} wrapperStyle={{ fontSize: 11 }} />
                    {canaisVis.flatMap((c) => [
                      <Bar key={`${c}|f`} dataKey={`${c}|f`} stackId="a" fill={corCanal(c)} />,
                      <Bar key={`${c}|i`} dataKey={`${c}|i`} stackId="a" fill={corCanal(c)} fillOpacity={0.35} />,
                    ])}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabela de períodos */}
          <Card className="min-w-0">
            <CardHeader className="pb-2"><CardTitle className="text-base">Períodos</CardTitle></CardHeader>
            <CardContent className="min-w-0 p-0">
              <div className="w-full overflow-x-auto">
                <Table className="whitespace-nowrap">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      {canaisVis.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                      <TableHead className="text-right">Firme</TableHead>
                      <TableHead className="text-right">Incerto</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodos.map((p) => (
                      <TableRow key={p.chave} className="cursor-pointer" onClick={() => setAberto(p)}>
                        <TableCell className="font-medium">{p.rotulo}</TableCell>
                        {canaisVis.map((c) => (
                          <TableCell key={c} className="text-right tabular-nums">{p.porCanal[c] ? formatBRL(p.porCanal[c]) : "—"}</TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{formatBRL(p.firme)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatBRL(p.incerto)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatBRL(p.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(p.acumulado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Sheet open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{aberto?.rotulo} · {aberto && formatBRL(aberto.total)}</SheetTitle>
          </SheetHeader>
          <TooltipProvider>
            <div className="mt-4 w-full overflow-x-auto">
              <Table className="whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead><TableHead>Título</TableHead><TableHead>Canal</TableHead>
                    <TableHead>Vencimento</TableHead><TableHead>Crédito</TableHead><TableHead>Qualidade</TableHead>
                    <TableHead className="text-right">Líquido</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aberto?.itens.map((r) => (
                    <TableRow key={`${r.origem}-${r.origem_id}`}>
                      <TableCell className="max-w-[12rem] truncate" title={r.cliente ?? ""}>{r.cliente ?? "—"}</TableCell>
                      <TableCell>{r.numero_titulo ?? "—"}</TableCell>
                      <TableCell>{canalDe(r)}</TableCell>
                      <TableCell>{r.data_vencimento_atual ? ddmm(r.data_vencimento_atual) : "—"}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger className="underline decoration-dotted">{r.dia_credito ? ddmm(r.dia_credito) : "—"}</TooltipTrigger>
                          <TooltipContent className="max-w-xs">{r.regra_data ?? "Sem regra informada"}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.eh_firme ? "default" : "outline"}>{r.qualidade ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(valor(r))}</TableCell>
                      <TableCell>
                        {r.pedido_id && (
                          <Link to={`/pedidos/${r.pedido_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            Pedido <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
