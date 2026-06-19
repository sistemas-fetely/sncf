import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string;
  valorLiquido: number;
  parceiroId: string;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AplicarHaverPedidoDialog({ open, onOpenChange, pedidoId, idExterno, valorLiquido, parceiroId }: Props) {
  const qc = useQueryClient();
  const [haverId] = useState<string | null>(null);

  const { data: haveres = [] } = useQuery({
    queryKey: ["haveres-parceiro", parceiroId],
    enabled: open && !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("haver_cliente")
        .select("id, saldo, motivo, created_at")
        .eq("parceiro_id", parceiroId)
        .eq("status", "disponivel")
        .gt("saldo", 0)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totalHaver = haveres.reduce((s: number, h: any) => s + Number(h.saldo), 0);
  const haverSelecionado = haveres.find((h: any) => h.id === haverId);
  const saldoHaver = haverSelecionado ? Number(haverSelecionado.saldo) : totalHaver;

  const caso =
    Math.abs(saldoHaver - valorLiquido) < 0.01 ? "igual" :
    saldoHaver > valorLiquido ? "maior" : "menor";

  const mutation = useMutation({
    mutationFn: async () => {
      const hid = haverId ?? haveres[0]?.id;
      if (!hid) throw new Error("Nenhum haver selecionado");
      const { data, error } = await (supabase as any).rpc("aplicar_haver_pedido", {
        p_haver_id: hid,
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.caso === "haver_cobre_pedido") {
        toast.success("Crédito aplicado — pedido avançou para pré-faturamento");
      } else {
        toast.success(`Crédito de ${fmtBRL.format(Number(data?.valor_aplicado ?? 0))} aplicado — pedido voltou para cobrança`);
      }
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["credito-clientes-haveres"] });
      qc.invalidateQueries({ queryKey: ["haveres-parceiro", parceiroId] });
      qc.invalidateQueries({ queryKey: ["haver-disponivel", parceiroId] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Erro ao aplicar crédito"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar crédito no pedido</DialogTitle>
          <DialogDescription>
            Pedido <span className="font-medium">{idExterno}</span> · Valor: {fmtBRL.format(valorLiquido)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Crédito disponível</p>
              <p className="text-lg font-semibold">{fmtBRL.format(totalHaver)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Valor do pedido</p>
              <p className="text-lg font-semibold">{fmtBRL.format(valorLiquido)}</p>
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
            {haveres.length === 0 ? (
              <p className="text-muted-foreground">Nenhum crédito disponível para este cliente.</p>
            ) : caso === "igual" ? (
              <>
                <p className="font-medium">Crédito cobre o pedido exatamente</p>
                <p className="text-xs text-muted-foreground">Pedido avança para pré-faturamento. Haver zerado.</p>
              </>
            ) : caso === "maior" ? (
              <>
                <p className="font-medium">Crédito cobre o pedido e sobra {fmtBRL.format(saldoHaver - valorLiquido)}</p>
                <p className="text-xs text-muted-foreground">Pedido avança para pré-faturamento. Saldo vira novo crédito para o cliente.</p>
              </>
            ) : (
              <>
                <p className="font-medium">Crédito cobre {fmtBRL.format(saldoHaver)} — faltam {fmtBRL.format(valorLiquido - saldoHaver)}</p>
                <p className="text-xs text-muted-foreground">Pedido volta para cobrança automaticamente. SOps define pagamento da diferença.</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={haveres.length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "Aplicando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
