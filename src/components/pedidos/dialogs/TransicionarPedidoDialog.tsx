import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
}

export function TransicionarPedidoDialog({
  pedido_id, estagio_atual, triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const transicoes = transicoesPara(estagio_atual).filter((e) => e !== "cancelado");

  const [para, setPara] = useState<EstagioPedido | "">(transicoes[0] || "");
  const [proximaAcao, setProximaAcao] = useState("");
  const [motivo, setMotivo] = useState("");

  const transicionar = useTransicionarPedido();

  if (transicoes.length === 0) return null;

  const motivoObrigatorio = para === "cancelado" || para === "recuperacao_venda";
  const motivoFaltando = motivoObrigatorio && !motivo.trim();

  const handleConfirm = async () => {
    if (!para) return;
    if (motivoFaltando) return;
    await transicionar.mutateAsync({
      pedido_id,
      para_estagio: para as EstagioPedido,
      proxima_acao: proximaAcao || undefined,
      motivo: motivo || undefined,
    });
    setOpen(false);
    setMotivo("");
    setProximaAcao("");
  };

  const label = triggerLabel || (estagio_atual === "recebido" ? "Triar e encaminhar" : "Avançar estágio");

  // Triar é ação primária do recebido → destaque. Avançar estágio é fallback genérico → outline.
  const isAcaoPrimaria = estagio_atual === "recebido" || !!triggerLabel;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant={isAcaoPrimaria ? "default" : "outline"}>
          <ArrowRight className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Estágio atual: <strong>{ESTAGIO_LABELS[estagio_atual]}</strong>. Escolha o próximo estágio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
          <div className="space-y-2">
            <Label>Próxima ação (opcional)</Label>
            <Input
              value={proximaAcao}
              onChange={(e) => setProximaAcao(e.target.value)}
              placeholder="Ex: Emitir boleto, esperar pagamento, etc."
            />
          </div>
          <div className="space-y-2">
            <Label>Motivo/observação (opcional)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que está avançando? Vai pro audit trail."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!para || transicionar.isPending}>
            {transicionar.isPending ? "Avançando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
