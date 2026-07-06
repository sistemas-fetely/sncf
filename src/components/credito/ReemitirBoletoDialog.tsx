import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";

interface Props {
  titulo: TituloCobranca;
  open: boolean;
  onClose: () => void;
}

function amanhaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function ReemitirBoletoDialog({ titulo, open, onClose }: Props) {
  const qc = useQueryClient();
  const minData = useMemo(() => amanhaISO(), []);
  const [novaData, setNovaData] = useState<string>(minData);
  const [novoValor, setNovoValor] = useState<string>(
    (titulo.valor_efetivo ?? 0).toFixed(2),
  );
  const [motivo, setMotivo] = useState("");

  const isRejeitado = titulo.boleto_status === "rejeitado";
  const textoExplicativo = isRejeitado
    ? "O boleto rejeitado será descartado e o título voltará à fila para nova remessa de entrada."
    : "O boleto atual será baixado no Safra e um novo boleto será gerado com os dados abaixo.";

  const valorOriginal = Number(titulo.valor_efetivo ?? 0);
  const valorAtual = Number(novoValor.replace(",", "."));
  const valorAlterado = Math.abs(valorAtual - valorOriginal) > 0.001;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!novaData || novaData < minData) {
        throw new Error("Escolha uma data de vencimento a partir de amanhã.");
      }
      if (!Number.isFinite(valorAtual) || valorAtual <= 0) {
        throw new Error("Valor inválido.");
      }
      const { data, error } = await (supabase as any).rpc("solicitar_reemissao_boleto", {
        p_titulo_id: titulo.id,
        p_nova_data: novaData,
        p_novo_valor: valorAlterado ? valorAtual : null,
        p_motivo: motivo.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.mensagem ?? "Reemissão solicitada.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao solicitar reemissão."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reemitir boleto — {titulo.numero_titulo}</DialogTitle>
          <DialogDescription>{textoExplicativo}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nova-data">Nova data de vencimento *</Label>
            <Input
              id="nova-data"
              type="date"
              min={minData}
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="novo-valor">Valor do boleto (R$)</Label>
            <Input
              id="novo-valor"
              type="number"
              step="0.01"
              min="0"
              value={novoValor}
              onChange={(e) => setNovoValor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Original: R$ {valorOriginal.toFixed(2).replace(".", ",")}
              {valorAlterado ? " · valor alterado" : " · sem alteração"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea
              id="motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: cliente solicitou nova data para pagamento"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Reemitindo..." : "Reemitir boleto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
