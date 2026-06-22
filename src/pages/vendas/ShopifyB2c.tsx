import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ImportarCsvShopifyDialog } from "@/components/shopify/ImportarCsvShopifyDialog";
import { useShopifyPedidos } from "@/hooks/shopify/useShopifyPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 15;

function fmtData(s: string | null): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy"); } catch { return "—"; }
}

function txt(s: string | null): string {
  return s && s.trim() !== "" ? s : "—";
}

function dinheiro(v: number | null): string {
  return BRL.format(Number(v || 0));
}

export default function ShopifyB2c() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [fin, setFin] = useState("todos");
  const [ful, setFul] = useState("todos");
  const [uf, setUf] = useState("todas");
  const [page, setPage] = useState(1);
  const { data: pedidos, isLoading } = useShopifyPedidos();

  const opcoesFin = useMemo(() => {
    const set = new Set();
    (pedidos ?? []).forEach((p) => p.financial_status && set.add(p.financial_status));
    return Array.from(set).sort();
  }, [pedidos]);

  const opcoesFul = useMemo(() => {
    const set = new Set();
    (pedidos ?? []).forEach((p) => p.fulfillment_status && set.add(p.fulfillment_status));
    return Array.from(set).sort();
  }, [pedidos]);

  const ufs = useMemo(() => {
    const set = new Set();
    (pedidos ?? []).forEach((p) => p.shipping_province && set.add(p.shipping_province));
    return Array.from(set).sort();
  }, [pedidos]);

  const filtrados = useMemo(() => {
    let lista = pedidos ?? [];
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      lista = lista.filter((p) => (p.order_name ?? "").toLowerCase().includes(q));
    }
    if (fin !== "todos") lista = lista.filter((p) => p.financial_status === fin);
    if (ful !== "todos") lista = lista.filter((p) => p.fulfillment_status === ful);
    if (uf !== "todas") lista = lista.filter((p) => p.shipping_province === uf);
    return lista;
  }, [pedidos, busca, fin, ful, uf]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Shopify · B2C</h1>
        <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          Importar CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por pedido…"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPage(1); }}
          className="w-[200px]"
        />
        <Select value={fin} onValueChange={(v) => { setFin(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Financeiro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Financeiro: todos</SelectItem>
            {opcoesFin.map((s) => <SelectItem key={String(s)} value={String(s)}>{String(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ful} onValueChange={(v) => { setFul(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Envio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Envio: todos</SelectItem>
            {opcoesFul.map((s) => <SelectItem key={String(s)} value={String(s)}>{String(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={uf} onValueChange={(v) => { setUf(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as UFs</SelectItem>
            {ufs.map((u) => <SelectItem key={String(u)} value={String(u)}>{String(u)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead>Envio</TableHead>
                  <TableHead>Pgto</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reembolso</TableHead>
                  <TableHead>Modal</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>CEP</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead>Cumprido em</TableHead>
                  <TableHead>Cancelado em</TableHead>
                  <TableHead>WNS</TableHead>
                  <TableHead>Rastreio</TableHead>
                  <TableHead>Rastreio Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8">
                      <Skeleton className="h-4 w-32 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : paginados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginados.map((p) => (
                    <TableRow key={p.shopify_id}>
                      <TableCell className="whitespace-nowrap">{txt(p.order_name)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtData(p.created_at_shopify)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.financial_status)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.fulfillment_status)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.payment_method)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{dinheiro(p.subtotal)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{dinheiro(p.discount_amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{dinheiro(p.shipping_cost)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{dinheiro(p.total)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{dinheiro(p.refunded_amount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.shipping_method)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.shipping_city)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.shipping_province)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.shipping_zip)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtData(p.paid_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtData(p.fulfilled_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtData(p.cancelled_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{txt(p.wns_pedido_id)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.tracking_number ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{p.tracking_number}</span>
                            <button
                              title="Copiar código"
                              onClick={() => navigator.clipboard.writeText(p.tracking_number!)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href="https://rastreamento.correios.com.br/app/index.php"
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir Correios"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.rastreio_entregue ? (
                          <Badge className="bg-green-600 hover:bg-green-600 text-white">Entregue</Badge>
                        ) : p.rastreio_status_atual ? (
                          <span className="text-xs">{p.rastreio_status_atual}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {filtrados.length} pedido(s){totalPages > 1 ? ` · página ${pageSafe} de ${totalPages}` : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}>
              Próximo
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      <ImportarCsvShopifyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
