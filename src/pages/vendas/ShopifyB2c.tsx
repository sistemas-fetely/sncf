import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2,
} from "lucide-react";
import { format, differenceInDays, differenceInMinutes } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { ImportarCsvShopifyDialog } from "@/components/shopify/ImportarCsvShopifyDialog";
import {
  useShopifyPedidos, useShopifyTopSkus, type ShopifyPedidoRow,
} from "@/hooks/shopify/useShopifyPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 15;

type TabKey = "todos" | "pagos" | "expirados" | "pendentes_envio" | "em_transito" | "entregues";

const COLOR_PIX = "#1A4A3A";
const COLOR_CARTAO = "#185FA5";
const COLOR_MISTO = "#7C3AED";

function fmtData(s: string | null): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM"); } catch { return "—"; }
}

function badgePagamento(p: string | null) {
  if (p === "pix") return <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]/90">PIX</Badge>;
  if (p === "cartao") return <Badge className="bg-blue-600 text-white hover:bg-blue-600/90">Cartão</Badge>;
  if (p === "misto") return <Badge className="bg-purple-600 text-white hover:bg-purple-600/90">Misto</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

function badgeFinanceiro(s: string) {
  if (s === "paid") return <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]/90">Pago</Badge>;
  if (s === "expired") return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Expirado</Badge>;
  if (s === "pending") return <Badge variant="secondary">Pendente</Badge>;
  if (s === "refunded") return <Badge variant="destructive">Reembolsado</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function badgeEnvio(s: string | null) {
  if (s === "fulfilled") return <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]/90">Entregue</Badge>;
  if (s === "unfulfilled") return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Pendente</Badge>;
  return <Badge variant="secondary">{s ?? "—"}</Badge>;
}

function badgeUrgencia(p: ShopifyPedidoRow) {
  if (p.urgency_envio === "critico") return <Badge variant="destructive">{p.dias_sem_envio}d</Badge>;
  if (p.urgency_envio === "atencao") return <Badge className="bg-amber-500 text-white">{p.dias_sem_envio}d</Badge>;
  if (p.urgency_envio === "ok") return <Badge className="bg-[#1A4A3A] text-white">{p.dias_sem_envio}d</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

function trClass(p: ShopifyPedidoRow): string {
  if (p.urgency_envio === "critico") return "bg-destructive/10 hover:bg-destructive/15";
  if (p.urgency_envio === "atencao") return "bg-amber-100/60 dark:bg-amber-900/20 hover:bg-amber-100";
  return "";
}

export default function ShopifyB2c() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("todos");
  const [uf, setUf] = useState<string>("todas");
  const [modalFiltro, setModalFiltro] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data: pedidos, isLoading } = useShopifyPedidos();
  const { data: topSkus } = useShopifyTopSkus();

  const periodo = useMemo(() => {
    if (!pedidos?.length) return null;
    const datas = pedidos.map((p) => new Date(p.created_at_shopify).getTime());
    const min = new Date(Math.min(...datas));
    const max = new Date(Math.max(...datas));
    return `${format(min, "dd/MM")} – ${format(max, "dd/MM/yyyy")}`;
  }, [pedidos]);

  const criticos = useMemo(
    () => (pedidos ?? []).filter((p) => p.urgency_envio === "critico"),
    [pedidos]
  );
  const atencao = useMemo(
    () => (pedidos ?? []).filter((p) => p.urgency_envio === "atencao"),
    [pedidos]
  );

  const maiorCritico = useMemo(() => {
    if (!criticos.length) return null;
    return [...criticos].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  }, [criticos]);

  const kpis = useMemo(() => {
    const lista = pedidos ?? [];
    const pagos = lista.filter((p) => p.financial_status === "paid");
    const expirados = lista.filter((p) => p.financial_status === "expired");
    const receitaPaga = pagos.reduce((s, p) => s + Number(p.total || 0), 0);
    const receitaBruta = lista.reduce((s, p) => s + Number(p.total || 0), 0);
    const ticketMedio = pagos.length ? receitaPaga / pagos.length : 0;
    const conversao = lista.length ? (pagos.length / lista.length) * 100 : 0;
    const pendentes = lista.filter(
      (p) => p.financial_status === "paid" && p.fulfillment_status === "unfulfilled"
    ).length;
    const pctPix = lista.length
      ? (lista.filter((p) => p.payment_method === "pix").length / lista.length) * 100
      : 0;
    const pctCartao = lista.length
      ? (lista.filter((p) => p.payment_method === "cartao").length / lista.length) * 100
      : 0;
    return {
      receitaPaga, receitaBruta, total: lista.length, ticketMedio, conversao,
      pagos: pagos.length, expirados: expirados.length, pendentes, pctPix, pctCartao,
    };
  }, [pedidos]);

  const vendasPorDia = useMemo(() => {
    const map = new Map<string, number>();
    (pedidos ?? []).forEach((p) => {
      const dia = format(new Date(p.created_at_shopify), "dd/MM");
      map.set(dia, (map.get(dia) ?? 0) + Number(p.total || 0));
    });
    return Array.from(map.entries())
      .map(([dia, receita]) => ({ dia, receita }))
      .reverse();
  }, [pedidos]);

  const splitPagamento = useMemo(() => {
    const lista = pedidos ?? [];
    const counts: Record<string, number> = { pix: 0, cartao: 0, misto: 0 };
    lista.forEach((p) => {
      const k = p.payment_method;
      if (k && counts[k] !== undefined) counts[k]++;
    });
    const total = counts.pix + counts.cartao + counts.misto;
    return [
      { key: "pix", name: "PIX", value: counts.pix, color: COLOR_PIX,
        pct: total ? `${Math.round((counts.pix / total) * 100)}%` : "0%" },
      { key: "cartao", name: "Cartão", value: counts.cartao, color: COLOR_CARTAO,
        pct: total ? `${Math.round((counts.cartao / total) * 100)}%` : "0%" },
      { key: "misto", name: "Misto", value: counts.misto, color: COLOR_MISTO,
        pct: total ? `${Math.round((counts.misto / total) * 100)}%` : "0%" },
    ];
  }, [pedidos]);

  const urgentes = useMemo(() => {
    return (pedidos ?? [])
      .filter((p) => p.urgency_envio !== null)
      .sort((a, b) => (b.dias_sem_envio ?? 0) - (a.dias_sem_envio ?? 0))
      .slice(0, 12);
  }, [pedidos]);

  const modais = useMemo(() => {
    const lista = pedidos ?? [];
    const norm = (s: string | null) => (s ?? "").toLowerCase();
    return {
      pac: lista.filter((p) => norm(p.shipping_method).includes("pac")).length,
      sedex: lista.filter((p) => norm(p.shipping_method).includes("sedex")).length,
      loggi: lista.filter((p) => norm(p.shipping_method).includes("loggi")).length,
    };
  }, [pedidos]);

  const tempoPreparo = useMemo(() => {
    const lista = (pedidos ?? []).filter((p) => p.paid_at && p.fulfilled_at);
    if (!lista.length) return "—";
    const totalMin = lista.reduce(
      (s, p) => s + differenceInMinutes(new Date(p.fulfilled_at!), new Date(p.paid_at!)),
      0
    );
    const avg = totalMin / lista.length;
    const h = Math.floor(avg / 60);
    const m = Math.round(avg % 60);
    return `${h}h ${m}m`;
  }, [pedidos]);

  const transito = useMemo(() => {
    const lista = pedidos ?? [];
    return {
      em: lista.filter((p) => p.status_entrega === "em_transito").length,
      vencido: lista.filter((p) => p.status_entrega === "vencido").length,
    };
  }, [pedidos]);

  const ufs = useMemo(() => {
    const set = new Set<string>();
    (pedidos ?? []).forEach((p) => p.shipping_province && set.add(p.shipping_province));
    return Array.from(set).sort();
  }, [pedidos]);

  const filtrados = useMemo(() => {
    let lista = pedidos ?? [];
    switch (tab) {
      case "pagos": lista = lista.filter((p) => p.financial_status === "paid"); break;
      case "expirados": lista = lista.filter((p) => p.financial_status === "expired"); break;
      case "pendentes_envio":
        lista = lista.filter(
          (p) => p.financial_status === "paid" && p.fulfillment_status === "unfulfilled"
        ); break;
      case "em_transito":
        lista = lista.filter((p) => p.status_entrega === "em_transito"); break;
      case "entregues":
        lista = lista.filter((p) => p.status_entrega === "vencido" || p.fulfillment_status === "fulfilled"); break;
    }
    if (uf !== "todas") lista = lista.filter((p) => p.shipping_province === uf);
    if (modalFiltro) {
      const k = modalFiltro.toLowerCase();
      lista = lista.filter((p) => (p.shipping_method ?? "").toLowerCase().includes(k));
    }
    return lista;
  }, [pedidos, tab, uf, modalFiltro]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const maxSkuQty = useMemo(
    () => Math.max(1, ...((topSkus ?? []).slice(0, 8).map((s) => s.total_quantity))),
    [topSkus]
  );

  return (
    <div className="p-6 space-y-6">
      {/* BLOCO A — HEADER */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Shopify · B2C</h1>
            <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]/90">Mercado Pago</Badge>
            {periodo && <span className="text-sm text-muted-foreground">Período: {periodo}</span>}
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Importar CSV
        </Button>
      </header>

      {/* BLOCO B — ALERT BANNER */}
      {criticos.length > 0 && maiorCritico && (
        <div className="border border-destructive bg-destructive/10 text-destructive rounded-md p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>{criticos.length} pedidos pagos sem envio</strong> · {BRL.format(
              criticos.reduce((s, p) => s + Number(p.total || 0), 0)
            )} em risco · Maior: <strong>{maiorCritico.order_name}</strong> — {maiorCritico.shipping_method ?? "—"}{" "}
            {maiorCritico.shipping_province ?? ""} · pago há {maiorCritico.dias_sem_envio} dias.
          </div>
        </div>
      )}

      {/* BLOCO C — KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Receita paga" value={BRL.format(kpis.receitaPaga)}
            sub={`bruto ${BRL.format(kpis.receitaBruta)}`} />
          <KpiCard label="Pedidos" value={String(kpis.total)}
            sub={`${kpis.pagos} pagos · ${kpis.expirados} expirados`} />
          <KpiCard label="Ticket médio" value={BRL.format(kpis.ticketMedio)} sub="no período" />
          <KpiCard label="Conversão" value={`${kpis.conversao.toFixed(1)}%`}
            sub={`PIX ${kpis.pctPix.toFixed(0)}% · Cartão ${kpis.pctCartao.toFixed(0)}%`} />
          <KpiCard label="Envio pendente" value={String(kpis.pendentes)}
            sub={`${criticos.length} críticos · ${atencao.length} atenção`}
            danger={kpis.pendentes > 0} />
        </div>
      )}

      {/* BLOCO D — GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Receita por dia</CardTitle>
            <span className="text-sm text-muted-foreground">{BRL.format(kpis.receitaBruta)}</span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={vendasPorDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dia" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => BRL.format(v)} />
                    <Bar dataKey="receita" fill={COLOR_PIX} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={splitPagamento}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {splitPagamento.map((s) => <Cell key={s.key} fill={s.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4 text-xs mt-2">
                  {splitPagamento.map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.value} · {s.pct}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCO E — OPERACIONAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base ${criticos.length > 0 ? "text-destructive" : ""}`}>
              Urgência de envio
            </CardTitle>
            <p className="text-xs text-muted-foreground">Pedidos pagos aguardando expedição</p>
          </CardHeader>
          <CardContent className="p-0">
            {urgentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="h-8 w-8 text-[#1A4A3A]" />
                <p className="text-sm text-muted-foreground">Todos os pedidos foram enviados</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Frete</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Urgência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentes.map((p) => (
                    <TableRow key={p.shopify_id} className={trClass(p)}>
                      <TableCell className="font-medium">{p.order_name}</TableCell>
                      <TableCell>{fmtData(p.paid_at)}</TableCell>
                      <TableCell>{p.dias_sem_envio ?? "—"}</TableCell>
                      <TableCell>{p.shipping_method ?? "—"}</TableCell>
                      <TableCell className="text-right">{BRL.format(Number(p.total || 0))}</TableCell>
                      <TableCell>{p.shipping_province ?? "—"}</TableCell>
                      <TableCell>{badgeUrgencia(p)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top SKUs · unidades vendidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(topSkus ?? []).slice(0, 8).map((s) => {
              const nome = (s.product_name ?? s.sku ?? "—").slice(0, 28);
              const w = (s.total_quantity / maxSkuQty) * 100;
              return (
                <div key={s.sku} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium">{nome}</span>
                    <span className="text-[11px] text-muted-foreground">{s.total_quantity}</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{s.sku}</div>
                  <div className="h-[6px] bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: COLOR_PIX }} />
                  </div>
                </div>
              );
            })}
            {(!topSkus || topSkus.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCO F — LOGÍSTICA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Modal de frete</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              { label: "PAC", count: modais.pac, k: "pac" },
              { label: "Sedex", count: modais.sedex, k: "sedex" },
              { label: "Loggi", count: modais.loggi, k: "loggi" },
            ].map((m) => (
              <button
                key={m.k}
                onClick={() => { setModalFiltro(modalFiltro === m.k ? null : m.k); setPage(1); }}
                className={`px-3 py-1.5 rounded-md border text-xs transition ${
                  modalFiltro === m.k ? "bg-[#1A4A3A] text-white border-[#1A4A3A]" : "bg-background hover:bg-muted"
                }`}
              >
                {m.label} · <span className="font-semibold">{m.count}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tempo médio de preparo</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{tempoPreparo}</div>
            <p className="text-xs text-muted-foreground mt-1">pago → expedido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Em trânsito</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{transito.em}</div>
            {transito.vencido > 0 && (
              <p className="text-xs text-destructive mt-1">{transito.vencido} com prazo vencido</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCO G — TABELA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="expirados">Expirados</TabsTrigger>
            <TabsTrigger value="pendentes_envio">Pendentes de envio</TabsTrigger>
            <TabsTrigger value="em_transito">Em trânsito</TabsTrigger>
            <TabsTrigger value="entregues">Entregues</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={uf} onValueChange={(v) => { setUf(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as UFs</SelectItem>
            {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Frete</TableHead>
                <TableHead>Pgto</TableHead>
                <TableHead>Financeiro</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9}><Skeleton className="h-32 w-full" /></TableCell>
                </TableRow>
              ) : paginados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhum pedido nesta visão.
                  </TableCell>
                </TableRow>
              ) : (
                paginados.map((p) => {
                  const isUnf = p.financial_status === "paid" && p.fulfillment_status === "unfulfilled";
                  const isFul = p.fulfillment_status === "fulfilled";
                  return (
                    <TableRow key={p.shopify_id} className={trClass(p)}>
                      <TableCell className="font-medium">{p.order_name}</TableCell>
                      <TableCell>{fmtData(p.created_at_shopify)}</TableCell>
                      <TableCell className="text-right">{BRL.format(Number(p.total || 0))}</TableCell>
                      <TableCell>{p.shipping_method ?? "—"}</TableCell>
                      <TableCell>{badgePagamento(p.payment_method)}</TableCell>
                      <TableCell>{badgeFinanceiro(p.financial_status)}</TableCell>
                      <TableCell>{badgeEnvio(p.fulfillment_status)}</TableCell>
                      <TableCell>{p.shipping_province ?? "—"}</TableCell>
                      <TableCell>
                        {isUnf ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{p.dias_sem_envio}d s/ envio</span>
                            {badgeUrgencia(p)}
                          </div>
                        ) : isFul ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Prev. {fmtData(p.estimated_delivery)}</span>
                            {p.status_entrega === "vencido" ? (
                              <Badge variant="destructive">Vencido</Badge>
                            ) : p.status_entrega === "em_transito" ? (
                              <Badge className="bg-blue-600 text-white">Em trânsito</Badge>
                            ) : null}
                          </div>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {pageSafe} de {totalPages} · {filtrados.length} pedidos
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}>
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ImportarCsvShopifyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function KpiCard({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${danger ? "text-destructive" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
