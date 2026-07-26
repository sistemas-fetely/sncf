import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";

type Desfecho = "haver" | "troca" | "reembolso";

interface Props {
  pedidoId: string;
  pedidoIdExterno: string | null;
  parceiroId: string | null;
  open: boolean;
  onClose: () => void;
}

const DESFECHO_LABEL: Record<Desfecho, string> = {
  haver: "Manter como haver",
  troca: "Troca por outro produto",
  reembolso: "Reembolso em dinheiro",
};

export function DevolucaoParcialDialog({
  pedidoId, pedidoIdExterno, parceiroId, open, onClose,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [valorStr, setValorStr] = useState("");
  const [nfDevolucao, setNfDevolucao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [desfecho, setDesfecho] = useState<Desfecho>("haver");

  const totalPedido = useQuery({
    queryKey: ["total-pedido-devolucao-parcial", pedidoId],
    enabled: open,
    staleTime: 0,
    queryFn: async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulos_a_receber")
        .select("valor_bruto, status")
        .eq("pedido_id", pedidoId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ status: string | null; valor_bruto: number | null }>;
      return rows
        .filter((t) =>
          t.status !== "cancelado" && t.status !== "devolvido" && t.status !== "cancelado_recuperacao")
        .reduce((s, t) => s + Number(t.valor_bruto ?? 0), 0);
    },
  });

  const valorNum = useMemo(() => {
    const n = Number(valorStr.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [valorStr]);

  const total = totalPedido.data ?? 0;
  const excedeTotal = total > 0 && valorNum > total + 0.005;
  const podeConfirmar =
    valorNum > 0 &&
    !excedeTotal &&
    motivo.trim().length >= 5 &&
    !!desfecho;

  const mut = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_devolucao_parcial", {
        p_pedido_id: pedidoId,
        p_valor: valorNum,
        p_nf_devolucao: nfDevolucao.trim() || null,
        p_motivo: motivo.trim(),
        p_desfecho: desfecho,
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar devolução parcial.");
      return data as {
        ok: true;
        pedido_id: string;
        valor_devolvido: number;
        desfecho: Desfecho;
        haver_id: string | null;
        nf_devolucao: string | null;
        reembolso: boolean;
        aviso?: string;
      };
    },
    onSuccess: (data) => {
      toast.success(
        `Devolução parcial de ${formatBRL(data.valor_devolvido)} registrada`,
        { description: `Desfecho: ${DESFECHO_LABEL[data.desfecho]}` },
      );
      if (data.desfecho === "troca") {
        toast(`Crédito de ${formatBRL(data.valor_devolvido)} gerado — use ao criar o novo pedido do cliente`, {
          duration: 12000,
          action: parceiroId
            ? {
                label: "Ver crédito do cliente",
                onClick: () => navigate(`/credito/clientes/${parceiroId}`),
              }
            : undefined,
        });
      } else if (data.desfecho === "reembolso") {
        toast.info("Crédito encerrado (devolvido) — pagamento ao cliente é feito por fora.", {
          duration: 10000,
        });
      }
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["credito-cliente"] });
      qc.invalidateQueries({ queryKey: ["haveres-cliente"] });
      if (parceiroId) {
        qc.invalidateQueries({ queryKey: ["cliente-detalhe", parceiroId] });
      }
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !mut.isPending && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Devolução parcial — pedido {pedidoIdExterno ?? ""}
          </DialogTitle>
          <DialogDescription>
            O cliente devolve parte do valor. Não encerra o pedido e não altera parcelas/boletos —
            apenas gera um crédito de devolução e roteia o desfecho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Valor devolvido (R$)</Label>
              <span className="text-xs text-muted-foreground">
                Total do pedido: <strong>{formatBRL(total)}</strong>
              </span>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder="0,00"
            />
            {excedeTotal && (
              <p className="text-xs text-red-700">
                Valor não pode exceder o total do pedido ({formatBRL(total)}).
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>NF de retorno (opcional)</Label>
            <Input
              value={nfDevolucao}
              onChange={(e) => setNfDevolucao(e.target.value)}
              placeholder="número da NF de devolução — pode preencher depois"
            />
          </div>

          <div className="space-y-1">
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique o motivo da devolução parcial..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Desfecho</Label>
            <RadioGroup value={desfecho} onValueChange={(v) => setDesfecho(v as Desfecho)}>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-haver" value="haver" className="mt-0.5" />
                <Label htmlFor="desf-haver" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Manter como haver</strong> — crédito fica disponível para o cliente usar em compras futuras.
                </Label>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-troca" value="troca" className="mt-0.5" />
                <Label htmlFor="desf-troca" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Troca por outro produto</strong> — crédito fica disponível e deve ser consumido ao criar o novo pedido.
                </Label>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-reembolso" value="reembolso" className="mt-0.5" />
                <Label htmlFor="desf-reembolso" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Reembolso em dinheiro</strong> — o crédito é encerrado (devolvido); o pagamento ao cliente é feito por fora.
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 !text-amber-700" />
            <AlertDescription className="text-xs text-amber-900">
              Não altera as parcelas em aberto — o cliente segue devendo o valor original e fica
              com crédito de <strong>{formatBRL(valorNum || 0)}</strong>.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Registrando..." : "Confirmar devolução parcial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
