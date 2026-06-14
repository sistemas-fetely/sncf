import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrimeiroPagamentoFila } from "@/hooks/credito/usePrimeiroPagamentoFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Info, Loader2 } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function PrimeiroPagamentoTab() {
  const [busca, setBusca] = useState("");
  const { data, isLoading } = usePrimeiroPagamentoFila({ busca: busca || undefined });
  const total = data?.length ?? 0;

  const [confirmando, setConfirmando] = useState<{ pedidoId: string; rotulo: string } | null>(null);
  const [dataPagamento, setDataPagamento] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState<string>("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const confirmar = useMutation({
    mutationFn: async (pedidoId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("confirmar_portao_pago", {
        p_pedido_id: pedidoId,
        p_data_pagamento: dataPagamento,
        p_observacao: observacao?.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Portão confirmado",
        description: "Pagamento registrado. O pedido avançou para pré-faturamento.",
      });
      qc.invalidateQueries({ queryKey: ["primeiro-pagamento-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-fila"] });
      setConfirmando(null);
      setObservacao("");
      setDataPagamento(new Date().toISOString().slice(0, 10));
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao confirmar portão",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function abrirDialog(pedidoId: string, rotulo: string) {
    setDataPagamento(new Date().toISOString().slice(0, 10));
    setObservacao("");
    setConfirmando({ pedidoId, rotulo });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} portão(ões) aguardando confirmação de pagamento
      </p>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Confirme o pagamento quando o cliente quitar o portão. O pedido então avança para pré-faturamento com os títulos definitivos.
        </AlertDescription>
      </Alert>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, razão social ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="text-right">Valor do portão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Dias aguardando</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && total === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum portão aguardando pagamento.
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow key={p.portao_id}>
                <TableCell>
                  <span className="font-mono text-xs font-semibold text-primary">
                    {p.id_externo}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{p.parceiro_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.parceiro_cnpj ? formatCNPJ(p.parceiro_cnpj) : "—"}
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatBRL(p.valor)}
                </TableCell>
                <TableCell>{fmtDate(p.data_vencimento)}</TableCell>
                <TableCell className="text-sm capitalize">{p.tipo_pagamento}</TableCell>
                <TableCell className="text-sm">
                  {p.dias_aguardando} dia{p.dias_aguardando !== 1 ? "s" : ""}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => abrirDialog(p.pedido_id, `${p.id_externo} · ${p.parceiro_nome}`)}
                  >
                    Confirmar pagamento
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirmando} onOpenChange={(v) => !v && !confirmar.isPending && setConfirmando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento do portão</DialogTitle>
            <DialogDescription>{confirmando?.rotulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-pagamento">Data do pagamento</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: PIX recebido na conta Safra"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)} disabled={confirmar.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmando && confirmar.mutate(confirmando.pedidoId)}
              disabled={confirmar.isPending}
            >
              {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
