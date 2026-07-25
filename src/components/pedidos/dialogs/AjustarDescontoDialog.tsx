import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";
import { ImpactoEdicaoBanner } from "@/components/pedidos/ImpactoEdicaoBanner";

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno?: string | null;
  valorBruto: number;
  bonusPixValor?: number | null;
  condicaoAtual?: string | null;
}

type Tipo = "pct" | "valor";

export function AjustarDescontoDialog({
  open, onClose, pedidoId, idExterno, valorBruto, bonusPixValor, condicaoAtual,
}: Props) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Tipo>("pct");
  const [valorStr, setValorStr] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  const bonus = Number(bonusPixValor || 0);
  const bruto = Number(valorBruto || 0);
  const valorNum = Number(String(valorStr).replace(",", ".")) || 0;

  const novoDesconto = useMemo(() => {
    if (tipo === "pct") return (bruto * valorNum) / 100;
    return valorNum;
  }, [tipo, bruto, valorNum]);

  const novoLiquido = bruto - novoDesconto - bonus;
  const liquidoNegativo = novoLiquido < 0;

  const mutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("alterar_desconto_pedido", {
        p_pedido_id: pedidoId,
        p_tipo: tipo,
        p_valor: valorNum,
        p_motivo: motivo || null,
      });
      if (error) throw error;
      if (data && typeof data === "object" && data.ok === false) {
        throw new Error(data.erro || "Erro ao ajustar desconto.");
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Desconto ajustado com sucesso.");
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      handleClose();
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível ajustar o desconto.");
    },
  });

  function handleClose() {
    if (mutation.isPending) return;
    setTipo("pct");
    setValorStr("");
    setMotivo("");
    onClose();
  }

  const podeConfirmar = valorNum > 0 && !liquidoNegativo && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar desconto{idExterno ? ` — ${idExterno}` : ""}</DialogTitle>
          <DialogDescription>
            Altera o desconto do pedido. Bloqueado se houver título a receber ativo ou remessa não cancelada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de desconto</Label>
            <RadioGroup
              value={tipo}
              onValueChange={(v) => setTipo(v as Tipo)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="pct" id="tipo-pct" />
                <span className="text-sm">Percentual (%)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="valor" id="tipo-valor" />
                <span className="text-sm">Valor (R$)</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor-desconto">
              {tipo === "pct" ? "Percentual (%)" : "Valor (R$)"}
            </Label>
            <Input
              id="valor-desconto"
              type="number"
              inputMode="decimal"
              min="0"
              step={tipo === "pct" ? "0.01" : "0.01"}
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder={tipo === "pct" ? "Ex.: 5" : "Ex.: 150,00"}
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor bruto</span>
              <span className="font-medium">{formatBRL(bruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="font-medium text-destructive">− {formatBRL(novoDesconto)}</span>
            </div>
            {bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bônus PIX</span>
                <span className="font-medium text-destructive">− {formatBRL(bonus)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 mt-1.5">
              <span className="text-muted-foreground">Novo líquido</span>
              <span className={`font-semibold text-base ${liquidoNegativo ? "text-destructive" : ""}`}>
                {formatBRL(novoLiquido)}
              </span>
            </div>
          </div>

          {liquidoNegativo && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>O líquido não pode ser negativo.</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: alinhamento com cliente"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!podeConfirmar}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
