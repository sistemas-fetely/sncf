import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PedidoStatusBadge } from "./PedidoStatusBadge";
import { CancelarItemDialog } from "./CancelarItemDialog";
import { CancelarPedidoDialog } from "./CancelarPedidoDialog";
import { TimelinePedido } from "./TimelinePedido";
import { useAuth } from "@/contexts/AuthContext";
import { useIniciarCompraPedido } from "@/hooks/compras/useIniciarCompraPedido";
import { useExcluirCompraRegistrada } from "@/hooks/compras/useExcluirCompraRegistrada";
import { useAnexosPedidoCompra } from "@/hooks/compras/useAnexosPedidoCompra";
import type {
  CompraRegistradaFull,
  PedidoCompraFull,
  PedidoCompraItemRow,
} from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (d?: string | null) =>
  d ? format(parseISO(d), "dd MMM yyyy", { locale: ptBR }) : "—";

interface PedidoComExtras extends PedidoCompraFull {
  solicitante_nome?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido: PedidoComExtras | null;
  podeAgir: boolean;
  onRegistrarCompra: (pedido: PedidoCompraFull) => void;
}

export function PedidoDetalheComprador({
  open,
  onOpenChange,
  pedido,
  podeAgir,
  onRegistrarCompra,
}: Props) {
  const iniciar = useIniciarCompraPedido();
  const excluirCompra = useExcluirCompraRegistrada();
  const { getSignedUrl } = useAnexosPedidoCompra(pedido?.id);

  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");

  const [cancelarItem, setCancelarItem] = useState<PedidoCompraItemRow | null>(null);
  const [excluirCompraDialog, setExcluirCompraDialog] = useState<CompraRegistradaFull | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [cancelarPedidoOpen, setCancelarPedidoOpen] = useState(false);

  const { data: comprasRegistradas = [] } = useQuery({
    queryKey: ["compras", "registradas-do-pedido", pedido?.id],
    enabled: !!pedido?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compras_registradas")
        .select(`
          *,
          parceiros_comerciais:parceiro_id (id, razao_social, nome_fantasia),
          plano_contas:plano_contas_id (id, codigo, nome),
          formas_pagamento:meio_pagamento_id (id, nome, tipo),
          compras_registradas_itens (
            *,
            pedidos_compra_itens:pedido_item_id (id, descricao)
          ),
          compras_registradas_anexos (*)
        `)
        .eq("pedido_id", pedido!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CompraRegistradaFull[];
    },
  });

  const totalEstimado = useMemo(
    () =>
      (pedido?.pedidos_compra_itens || [])
        .filter((i) => i.status === "pendente")
        .reduce(
          (s, i) => s + Number(i.quantidade) * Number(i.valor_estimado_unitario),
          0,
        ),
    [pedido],
  );

  const itensPendentes = (pedido?.pedidos_compra_itens || []).filter((i) => i.status === "pendente");

  const handleAbrirAnexo = async (storage_path: string) => {
    try {
      const url = await getSignedUrl(storage_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!pedido) return null;

  const ehMeu = pedido.status === "em_compra";
  const ehAberto = pedido.status === "aberto";
  const podeCancelarPedido =
    isSuperAdmin &&
    (pedido.status === "rascunho" || pedido.status === "aberto" || pedido.status === "em_compra");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <PedidoStatusBadge status={pedido.status} />
              <span className="text-xs text-muted-foreground">
                Enviado em {fmtDate(pedido.enviado_em)}
              </span>
            </div>
            <SheetTitle className="text-left">
              {pedido.descricao_geral || "(sem descrição)"}
            </SheetTitle>
            <SheetDescription className="text-left">
              <span className="font-medium">{pedido.solicitante_nome || "—"}</span>
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="detalhes" className="mt-6">
            <TabsList>
              <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
              <TabsTrigger value="timeline">Timeline e Comentários</TabsTrigger>
            </TabsList>
            <TabsContent value="detalhes" className="mt-4 space-y-6">
            {/* Detalhes */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">Detalhes</h4>
              <Card className="p-3 space-y-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Justificativa</span>
                  <p className="whitespace-pre-wrap">{pedido.justificativa || "—"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Centro de custo:</span>{" "}
                    {pedido.centros_custo?.nome || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Linha de invest.:</span>{" "}
                    {pedido.linhas_investimento?.descricao || "—"}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Fornecedor preferencial:</span>{" "}
                    {pedido.parceiros_comerciais?.razao_social || "—"}
                  </div>
                </div>
              </Card>
            </section>

            {/* Itens */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">Itens</h4>
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtde</TableHead>
                      <TableHead className="text-right">V. unit</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pedido.pedidos_compra_itens || []).map((i) => {
                      const subtotal = Number(i.quantidade) * Number(i.valor_estimado_unitario);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="max-w-[200px]">
                            <div className="text-sm truncate" title={i.descricao}>
                              {i.descricao}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{Number(i.quantidade)}</TableCell>
                          <TableCell className="text-right">
                            {fmtBRL(Number(i.valor_estimado_unitario))}
                          </TableCell>
                          <TableCell className="text-right">{fmtBRL(subtotal)}</TableCell>
                          <TableCell>
                            <ItemStatusBadge status={i.status} motivo={i.cancelamento_motivo} />
                          </TableCell>
                          <TableCell>
                            {i.status === "pendente" && ehMeu && podeAgir && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setCancelarItem(i)}
                                title="Cancelar item"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              <div className="text-right text-sm">
                <span className="text-muted-foreground">
                  Total estimado pendente ({itensPendentes.length} itens):{" "}
                </span>
                <span className="font-semibold">{fmtBRL(totalEstimado)}</span>
              </div>
            </section>

            {/* Anexos do pedido */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">
                Anexos do solicitante ({pedido.pedidos_compra_anexos?.length || 0})
              </h4>
              {(pedido.pedidos_compra_anexos || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem anexos.</p>
              ) : (
                <div className="space-y-1">
                  {(pedido.pedidos_compra_anexos || []).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 p-2 border rounded-md text-sm"
                    >
                      <span className="flex-1 truncate">{a.nome_original}</span>
                      <Badge variant="outline" className="text-xs">
                        {a.tipo}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAbrirAnexo(a.storage_path)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Compras registradas */}
            {comprasRegistradas.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Compras já registradas ({comprasRegistradas.length})
                </h4>
                <div className="space-y-2">
                  {comprasRegistradas.map((c) => (
                    <Card key={c.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {c.parceiros_comerciais?.razao_social || "—"}
                        </div>
                        <Badge
                          variant={c.status === "finalizada" ? "default" : "secondary"}
                          className={
                            c.status === "finalizada"
                              ? "bg-success/10 text-success border-0"
                              : "bg-muted text-muted-foreground border-0"
                          }
                        >
                          {c.status === "finalizada" ? "Finalizada" : "Excluída"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        <div>Categoria: {c.plano_contas?.nome || "—"}</div>
                        <div>Data: {fmtDate(c.data_compra)}</div>
                        <div>Total: {fmtBRL(Number(c.valor_total))}</div>
                        <div>Parcelas: {c.parcelas_count}</div>
                      </div>
                      {c.status === "finalizada" && podeAgir && (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              setMotivoExclusao("");
                              setExcluirCompraDialog(c);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir compra
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )}
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              <TimelinePedido pedidoId={pedido.id} />
            </TabsContent>
          </Tabs>

          <SheetFooter className="mt-6 gap-2 sm:gap-2 flex-col sm:flex-row sm:justify-between">
            {podeCancelarPedido ? (
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10 sm:mr-auto"
                onClick={() => setCancelarPedidoOpen(true)}
              >
                <Ban className="h-4 w-4 mr-1" />
                Cancelar pedido
              </Button>
            ) : <span />}
            <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {podeAgir && ehAberto && (
              <Button
                onClick={async () => {
                  await iniciar.mutateAsync(pedido.id);
                  onOpenChange(false);
                }}
                disabled={iniciar.isPending}
                style={{ backgroundColor: "#1A4A3A", color: "white" }}
              >
                {iniciar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Iniciar compra
              </Button>
            )}
            {podeAgir && ehMeu && (
              <Button
                onClick={() => onRegistrarCompra(pedido)}
                style={{ backgroundColor: "#1A4A3A", color: "white" }}
              >
                Registrar compra
              </Button>
            )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CancelarPedidoDialog
        open={cancelarPedidoOpen}
        onOpenChange={setCancelarPedidoOpen}
        pedidoId={pedido.id}
        onCancelado={() => onOpenChange(false)}
      />

      <CancelarItemDialog
        open={!!cancelarItem}
        onOpenChange={(o) => !o && setCancelarItem(null)}
        itemId={cancelarItem?.id || null}
        itemDescricao={cancelarItem?.descricao}
      />

      <AlertDialog
        open={!!excluirCompraDialog}
        onOpenChange={(o) => !o && setExcluirCompraDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir compra registrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação cancela as parcelas geradas em Contas a Pagar e reabre os itens do pedido.
              Bloqueia se alguma parcela já foi conciliada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Motivo da exclusão (mín. 5 caracteres) *</Label>
            <Textarea
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivoExclusao.trim().length < 5 || excluirCompra.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!excluirCompraDialog) return;
                await excluirCompra.mutateAsync({
                  compra_id: excluirCompraDialog.id,
                  motivo: motivoExclusao.trim(),
                });
                setExcluirCompraDialog(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ItemStatusBadge({
  status,
  motivo,
}: {
  status: string;
  motivo?: string | null;
}) {
  if (status === "comprado")
    return <Badge className="bg-success/10 text-success border-0">Comprado</Badge>;
  if (status === "cancelado")
    return (
      <Badge
        className="bg-destructive/10 text-destructive border-0"
        title={motivo || undefined}
      >
        Cancelado
      </Badge>
    );
  return <Badge className="bg-muted text-muted-foreground border-0">Pendente</Badge>;
}
