import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  useAdicionarObsComercial,
  useItensPedidoOportunidade,
  useObsComerciaisPedido,
} from "@/hooks/comercial/usePedidoOportunidadeDetalhe";


/** Texto curto do chip de situação — map, nunca concatenação. */
export const SITUACAO_CHIP: Record<string, string> = {
  sem_recebivel: "Sem recebível",
  previsto: "Previsto",
  coberto_haver: "Coberto por crédito",
  sem_cobranca: "Sem cobrança",
  parcial_pago: "Parcial pago",
  vencido: "Vencido",
  quitado: "Quitado",
  anulado: "Anulado",
  recebivel_familia: "Recebível na família",
};

export function chipSituacao(situacao: string | null | undefined): string {
  return SITUACAO_CHIP[situacao ?? ""] ?? "Em aberto";
}

function formatDataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string | null;
  cliente: string | null;
  valorEmJogo: number | null;
  situacaoFinanceira: string | null;
  alertaOperacional?: string | null;
}

export function PedidoOportunidadeDialog({
  open,
  onOpenChange,
  pedidoId,
  idExterno,
  cliente,
  valorEmJogo,
  situacaoFinanceira,
  alertaOperacional,
}: Props) {
  const [texto, setTexto] = useState("");
  const itens = useItensPedidoOportunidade(pedidoId, open);
  const obs = useObsComerciaisPedido(pedidoId, open);
  const adicionar = useAdicionarObsComercial(pedidoId);

  const total = (itens.data ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const podeEnviar = texto.trim().length > 0 && !adicionar.isPending;

  const enviar = async () => {
    if (!podeEnviar) return;
    try {
      await adicionar.mutateAsync(texto);
      setTexto("");
    } catch {
      /* toast já emitido no hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{idExterno || "Pedido"}</span>
            <span className="text-sm text-muted-foreground">{cliente || "—"}</span>
            <span className="text-sm">{formatBRL(valorEmJogo ?? 0)}</span>
            <Badge
              variant="outline"
              className="rounded px-2 py-0.5 text-xs"
              title={alertaOperacional ?? undefined}
            >
              {chipSituacao(situacaoFinanceira)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="itens">
          <TabsList>
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="obs">Obs. Comerciais</TabsTrigger>
          </TabsList>

          <TabsContent value="itens" className="mt-4">
            {itens.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (itens.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem itens registrados neste pedido.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unitário</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itens.data ?? []).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.sku || "—"}</TableCell>
                        <TableCell className="text-sm">{i.descricao || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {Number(i.quantidade ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.valor_unitario ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.subtotal ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wide">
                        Total
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="obs" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Contexto comercial: contato com o cliente, promessa de pagamento, condição pedida…"
              />
              <div className="flex justify-end">
                <Button onClick={enviar} disabled={!podeEnviar}>
                  {adicionar.isPending ? "Salvando…" : "Adicionar observação"}
                </Button>
              </div>
            </div>

            {obs.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (obs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma observação comercial ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {(obs.data ?? []).map((o) => (
                  <div key={o.id} className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDataHora(o.criado_em)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{o.descricao || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
