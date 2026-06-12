import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ImportarCsvShopifyDialog } from "@/components/shopify/ImportarCsvShopifyDialog";
import { useShopifyPedidos, type ShopifyPedidoRow } from "@/hooks/shopify/useShopifyPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 15;

type TabKey = "todos" | "pagos" | "expirados" | "pendentes_envio" | "em_transito" | "entregues";

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

function badgeUrgencia(dias: number | null) {
  if (dias == null) return <Badge variant="secondary">—</Badge>;
  if (dias >= 3) return <Badge variant="destructive">{dias}d</Badge>;
  if (dias === 2) return <Badge className="bg-amber-500 text-white">{dias}d</Badge>;
  return <Badge className="bg-[#1A4A3A] text-white">{dias}d</Badge>;
}

export default function ShopifyB2c() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("todos");
  const [page, setPage] = useState(1);
  const { data: pedidos, isLoading } = useShopifyPedidos();

  const periodo = useMemo(() => {
    if (!pedidos?.length) return null;
    const datas = pedidos.map((p) => new Date(p.created_at_shopify).getTime());
    const min = new Date(Math.min(...datas));
    const max = new Date(Math.max(...datas));
    return `${format(min, "dd/MM")} – ${format(max, "dd/MM/yyyy")}`;
  }, [pedidos]);

  const criticos = useMemo(() => {
    return (pedidos ?? []).filter((p) => p.urgency_envio === "critico");
  }, [pedidos]);

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

    // média de pedidos por dia
    let mediaDia = 0;
    if (lista.length) {
      const datas = lista.map((p) => new Date(p.created_at_shopify).getTime());
      const dias = Math.max(
        1,
        differenceInDays(new Date(Math.max(...datas)), new Date(Math.min(...datas))) + 1
      );
      mediaDia = lista.length / dias;
    }

    return {
      receitaPaga,
      receitaBruta,
      total: lista.length,
      mediaDia,
      ticketMedio,
      conversao,
      pagos: pagos.length,
      expirados: expirados.length,
      pendentes,
    };
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const lista = pedidos ?? [];
    switch (tab) {
      case "pagos": return lista.filter((p) => p.financial_status === "paid");
      case "expirados": return lista.filter((p) => p.financial_status === "expired");
      case "pendentes_envio":
        return lista.filter(
          (p) => p.financial_status === "paid" && p.fulfillment_status === "unfulfilled"
        );
      case "em_transito":
        return lista.filter((p) => p.status_entrega === "em_transito");
      case "entregues":
        return lista.filter((p) => p.status_entrega === "vencido" || p.fulfillment_status === "fulfilled");
      default: return lista;
    }
  }, [pedidos, tab]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function trClass(p: ShopifyPedidoRow): string {
    if (p.urgency_envio === "critico") return "bg-destructive/10 hover:bg-destructive/15";
    if (p.urgency_envio === "atencao") return "bg-amber-100/60 dark:bg-amber-900/20 hover:bg-amber-100";
    return "";
  }

  const maiorCritico = useMemo(() => {
    if (!criticos.length) return null;
    return [...criticos].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  }, [criticos]);

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl tracking-tight">Shopify · B2C</h1>
            <Badge className="bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]/90">Mercado Pago</Badge>
          </div>
          {periodo && (
            <p className="text-sm text-muted-foreground">Período: {periodo}</p>
          )}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Importar CSV
        </Button>
      </header>

      {/* ALERT BANNER */}
      {criticos.length > 0 && maiorCritico && (
        <div className="border border-destructive bg-destructive/10 text-destructive rounded-md p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>{criticos.length} pedidos pagos sem envio</strong> — {BRL.format(
              criticos.reduce((s, p) => s + Number(p.total || 0), 0)
            )} em risco. Maior urgência: <strong>{maiorCritico.order_name}</strong> ({BRL.format(
              Number(maiorCritico.total || 0)
            )} · {maiorCritico.shipping_method ?? "—"} {maiorCritico.shipping_province ?? ""}) pago há{" "}
            {maiorCritico.dias_sem_envio} dias.
          </div>
        </div>
      )}

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard
            label="Receita paga"
            value={BRL.format(kpis.receitaPaga)}
            sub={`bruto ${BRL.format(kpis.receitaBruta)}`}
          />
          <KpiCard
            label="Pedidos"
            value={String(kpis.total)}
            sub={`média ${kpis.mediaDia.toFixed(1)}/dia`}
          />
          <KpiCard
            label="Ticket médio"
            value={BRL.format(kpis.ticketMedio)}
            sub="no período"
          />
          <KpiCard
            label="Conversão"
            value={`${kpis.conversao.toFixed(1)}%`}
            sub={`${kpis.pagos} pagos · ${kpis.expirados} expirados`}
          />
          <KpiCard
            label="Envio pendente"
            value={String(kpis.pendentes)}
            sub="paid + unfulfilled"
            danger={kpis.pendentes > 0}
          />
        </div>
      )}

      {/* TABS */}
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

      {/* TABELA */}
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
                {tab === "pendentes_envio" && <TableHead>Dias s/ envio</TableHead>}
                {(tab === "em_transito" || tab === "entregues") && <TableHead>Previsão</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10}><Skeleton className="h-32 w-full" /></TableCell>
                </TableRow>
              ) : paginados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhum pedido nesta visão.
                  </TableCell>
                </TableRow>
              ) : (
                paginados.map((p) => (
                  <TableRow key={p.shopify_id} className={trClass(p)}>
                    <TableCell className="font-medium">{p.order_name}</TableCell>
                    <TableCell>{fmtData(p.created_at_shopify)}</TableCell>
                    <TableCell className="text-right">{BRL.format(Number(p.total || 0))}</TableCell>
                    <TableCell>{p.shipping_method ?? "—"}</TableCell>
                    <TableCell>{badgePagamento(p.payment_method)}</TableCell>
                    <TableCell>{badgeFinanceiro(p.financial_status)}</TableCell>
                    <TableCell>{badgeEnvio(p.fulfillment_status)}</TableCell>
                    <TableCell>{p.shipping_province ?? "—"}</TableCell>
                    {tab === "pendentes_envio" && (
                      <TableCell>{badgeUrgencia(p.dias_sem_envio)}</TableCell>
                    )}
                    {(tab === "em_transito" || tab === "entregues") && (
                      <TableCell>{fmtData(p.estimated_delivery)}</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* PAGINAÇÃO */}
      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {pageSafe} de {totalPages} · {filtrados.length} pedidos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
            >
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
