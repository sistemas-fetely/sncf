import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

export interface BaixaManualTitulo {
  id: string;
  numero_titulo: string | null;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  valor_atual?: number | null;
  boleto_status: string | null;
}

export function BaixaManualDialog({
  titulo,
  onClose,
}: {
  titulo: BaixaManualTitulo;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dataPag, setDataPag] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { error: rpcErr } = await (supabase as any).rpc("marcar_titulo_pago", {
        p_titulo_id: titulo.id,
        p_data_pagamento: dataPag + "T12:00:00" + ".000Z",
      });
      if (rpcErr) throw rpcErr;

      if (titulo.boleto_status !== null) {
        const { error: updErr } = await (supabase as any)
          .from("titulo_a_receber")
          .update({ boleto_status: "pago_manual" })
          .eq("id", titulo.id);
        if (updErr) throw updErr;
      }

      await qc.invalidateQueries({ queryKey: ["contas-receber-titulos"] });
      await qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      toast({ title: "Baixa registrada" });
      onClose();
    } catch (e: any) {
      toast({
        title: "Erro ao registrar baixa",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Baixa manual</DialogTitle>
          <DialogDescription>
            Título <span className="font-mono">{titulo.numero_titulo ?? "—"}</span> ·{" "}
            {formatBRL(titulo.valor_atual ?? titulo.valor_bruto ?? 0)} · venc.{" "}
            {formatDateBR(titulo.data_vencimento_atual)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="data-pag">Data do pagamento</Label>
          <Input
            id="data-pag"
            type="date"
            value={dataPag}
            onChange={(e) => setDataPag(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !dataPag}>
            {loading ? "Registrando..." : "Confirmar baixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BaixaManualDialog;
