import { useNavigate } from "react-router-dom";
import { ExternalLink, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useItensB2c, type PedidoB2cRow } from "@/hooks/vendas/useB2c";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

function txt(v: string | null | undefined): string {
  return v && String(v).trim() !== "" ? String(v) : "—";
}

function farolEstado(farol: string | null): EstadoSelo {
  if (farol === "no_prazo") return "success";
  if (farol === "atencao") return "warning";
  if (farol === "estourado") return "destructive";
  return "muted";
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-[2px] text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

interface Props {
  pedido: PedidoB2cRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PedidoB2cDrawer({ pedido, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: itens, isLoading } = useItensB2c(open ? pedido?.shopify_id ?? null : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-mono text-base">{txt(pedido?.order_name)}</SheetTitle>
          <SheetDescription>
            {txt(pedido?.cliente)} · {formatDateBR(pedido?.data_pedido)} ·{" "}
            {pedido?.estagio_rotulo ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          {/* Pedido */}
          <Bloco titulo="Pedido">
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                    </TableRow>
                  ) : (itens ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        Sem itens registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (itens ?? []).map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-xs">{txt(it.sku)}</TableCell>
                        <TableCell className="text-xs">{txt(it.product_name)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{it.quantity}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatBRL(it.unit_price)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatBRL(Number(it.unit_price) * Number(it.quantity))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-1 pt-1">
              <Linha rotulo="Subtotal">{formatBRL(pedido?.subtotal)}</Linha>
              <Linha rotulo="Desconto">{formatBRL(pedido?.discount_amount)}</Linha>
              <Linha rotulo="Frete">{formatBRL(pedido?.shipping_cost)}</Linha>
              <Linha rotulo="Total">
                <span className="font-medium tabular-nums">{formatBRL(pedido?.total)}</span>
              </Linha>
            </div>
            <div className="space-y-1 pt-1">
              <Linha rotulo="Endereço">
                {txt(pedido?.shipping_city)}
                {pedido?.shipping_province ? `/${pedido.shipping_province}` : ""}
                {pedido?.shipping_zip ? ` · ${pedido.shipping_zip}` : ""}
              </Linha>
              <Linha rotulo="Modal de envio">{txt(pedido?.shipping_method)}</Linha>
            </div>
          </Bloco>

          {/* Financeiro */}
          <Bloco titulo="Financeiro">
            <div className="space-y-1">
              <Linha rotulo="Forma de pagamento">{txt(pedido?.payment_method)}</Linha>
              <Linha rotulo="Status financeiro">{txt(pedido?.financial_status)}</Linha>
              <Linha rotulo="Pago em">{formatDateBR(pedido?.paid_at)}</Linha>
              <Linha rotulo="Nota fiscal">
                {pedido?.tem_nf ? (
                  <>
                    {txt(pedido?.nf_refs)}
                    {pedido?.nf_data_emissao ? ` · ${formatDateBR(pedido.nf_data_emissao)}` : ""}
                  </>
                ) : (
                  <Selo estado="warning">Sem NF</Selo>
                )}
              </Linha>
              <Linha rotulo="Recebimento MP">
                {pedido?.tem_recebimento ? (
                  <>
                    {formatBRL(pedido?.liquido_mp)} líquido · taxa {formatBRL(pedido?.taxa_mp)}
                  </>
                ) : (
                  <Selo estado="muted">Sem conciliação</Selo>
                )}
              </Linha>
              <Linha rotulo="Situação financeira">{txt(pedido?.situacao_financeira)}</Linha>
              {Number(pedido?.refunded_amount ?? 0) > 0 && (
                <Linha rotulo="Reembolsado">{formatBRL(pedido?.refunded_amount)}</Linha>
              )}
            </div>
          </Bloco>

          {/* Logística */}
          <Bloco titulo="Logística">
            <div className="space-y-1">
              <Linha rotulo="XPM">{txt(pedido?.xpm_codigo)}</Linha>
              <Linha rotulo="Estágio XPM">{txt(pedido?.xpm_estagio)}</Linha>
              <Linha rotulo="Farol SLA">
                {pedido?.xpm_farol_sla ? (
                  <Selo estado={farolEstado(pedido.xpm_farol_sla)}>{pedido.xpm_farol_sla}</Selo>
                ) : (
                  "—"
                )}
              </Linha>
              <Linha rotulo="Horas de ciclo">
                {pedido?.xpm_horas_ciclo != null ? `${Number(pedido.xpm_horas_ciclo).toFixed(1)} h` : "—"}
              </Linha>
              <Linha rotulo="Rastreio">
                {pedido?.tracking_number ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs">{pedido.tracking_number}</span>
                    {pedido.tracking_url && (
                      <a
                        href={pedido.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-colors hover:text-gold"
                        title="Abrir rastreio"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </Linha>
              <Linha rotulo="Transportadora">{txt(pedido?.tracking_company)}</Linha>
              <Linha rotulo="Status do rastreio">{txt(pedido?.rastreio_status)}</Linha>
              <Linha rotulo="Entrega prevista">{formatDateBR(pedido?.entrega_prevista)}</Linha>
            </div>
          </Bloco>

          {/* Link para o pedido no trilho geral */}
          {pedido?.pedido_id && (
            <Bloco titulo="Trilho geral">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between"
                onClick={() => navigate(`/pedidos/${pedido.pedido_id}`)}
              >
                Abrir pedido {txt(pedido.id_externo)}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Bloco>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
