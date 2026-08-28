import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, PackageX } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string;
}

export function ReterEstoqueDialog({ open, onOpenChange, pedidoId, idExterno }: Props) {
  const [motivo, setMotivo] = useState("");
  const qc = useQueryClient();

  const reter = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("reter_pedido_aguardando_estoque", {
        p_pedido_id: pedidoId,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      return data as { ok: boolean; id_externo: string; skus_em_falta: Array<{ sku: string; precisa: number; saldo: number }> };
    },
    onSuccess: (res) => {
      const faltas = res.skus_em_falta ?? [];
      toast({
        title: `${res.id_externo} retido em Aguardando Estoque`,
        description: faltas.length > 0
          ? `${faltas.length} SKU(s) sem saldo suficiente. Saída pela Triagem quando o produto chegar.`
          : "Nenhum SKU com saldo insuficiente no momento. Saída pela Triagem quando quiser liberar.",
      });
      invalidarPedido(qc, pedidoId);
      setMotivo("");
      onOpenChange(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => {
      const msg = e?.message ?? "Erro desconhecido";
      const dica = String(msg).includes("enviado ao Bling")
        ? " Se o envio ao Bling foi desfeito, use 'Desvincular do Bling' em Vínculos."
        : "";
      toast({ title: "Não foi possível reter", description: `${msg}${dica}`, variant: "destructive" });
    },

  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMotivo(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-4 w-4" />
            Reter {idExterno} em Aguardando Estoque
          </DialogTitle>
          <DialogDescription>
            O pedido sai da fila de expedição e fica aguardando produto. A cobrança e os títulos não são afetados. A saída é pela Triagem, que decide o destino quando o produto chegar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Motivo (fica na timeline)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ex.: aguardando chegada dos talheres Lavoire"
            className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {motivo.trim().length > 0 && motivo.trim().length < 5 && (
            <p className="text-[10px] text-destructive">Mínimo de 5 caracteres.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reter.isPending}>Cancelar</Button>
          <Button disabled={motivo.trim().length < 5 || reter.isPending} onClick={() => reter.mutate()}>
            {reter.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Retendo…</> : "Reter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
