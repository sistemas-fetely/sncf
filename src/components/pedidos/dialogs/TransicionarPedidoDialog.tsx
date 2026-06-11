import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
import { transicoesPara } from "@/lib/pedidoTransicoes";
import { ESTAGIO_LABELS } from "@/types/pedido";
import type { EstagioPedido } from "@/types/pedido";

interface Props {
  pedido_id: string;
  estagio_atual: EstagioPedido;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
}

export function TransicionarPedidoDialog({
  pedido_id, estagio_atual, triggerLabel, triggerVariant,
}: Props) {
  const [open, setOpen] = useState(false);

  const transicoes = transicoesPara(estagio_atual).filter((e) => e !== "cancelado");
  const destino_unico = transicoes.length === 1 ? transicoes[0] : null;

  const [para, setPara] = useState<EstagioPedido | "">(transicoes[0] || "");
  const [motivo, setMotivo] = useState("");

  const transicionar = useTransicionarPedido();

  if (transicoes.length === 0) return null;

  const label = triggerLabel ?? "Avançar fase →";
  const variant = triggerVariant ?? "outline";

  const handleConfirm = async () => {
    const destino = destino_unico ?? (para as EstagioPedido);
    if (!destino) return;
    await transicionar.mutateAsync({
      pedido_id,
      para_estagio: destino,
      motivo: motivo || undefined,
    });
    setOpen(false);
    setMotivo("");
    setPara(transicoes[0] || "");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 w-full" variant={variant}>
          <ArrowRight className="h-4 w-4" />
          {destino_unico
            ? `${label} ${ESTAGIO_LABELS[destino_unico]}`
            : label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avançar fase do pedido</DialogTitle>
          <DialogDescription>
            Estágio atual: <strong>{ESTAGIO_LABELS[estagio_atual]}</strong>.
            {destino_unico
              ? <> Próximo estágio: <strong>{ESTAGIO_LABELS[destino_unico]}</strong>.</>
              : " Escolha o próximo estágio."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!destino_unico && (
            <div className="space-y-2">
              <Label>Próximo estágio</Label>
              <Select value={para} onValueChange={(v) => setPara(v as EstagioPedido)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {transicoes.map((e) => (
                    <SelectItem key={e} value={e}>{ESTAGIO_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Motivo / observação{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Registrado no audit trail do pedido."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={(!destino_unico && !para) || transicionar.isPending}
          >
            {transicionar.isPending ? "Avançando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
