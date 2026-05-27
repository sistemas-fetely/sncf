import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";
import { useNavigate } from "react-router-dom";

interface Props {
  analise_id: string;
}

export function CancelarAnaliseDialog({ analise_id }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const navigate = useNavigate();
  const transicionar = useTransicionarAnalise();

  const motivoValido = motivo.trim().length >= 10;

  const handleConfirm = async () => {
    if (!motivoValido) return;
    await transicionar.mutateAsync({
      analise_id,
      acao: "cancelado",
      motivo: motivo.trim(),
    });
    setOpen(false);
    setMotivo("");
    navigate("/credito");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <X className="h-4 w-4" />
          Cancelar análise
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar análise</DialogTitle>
          <DialogDescription>
            Use também para "Devolver ao Thomer" — escreva o motivo, e o Sistema
            de Pedidos reenviará uma nova análise quando corrigir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Motivo (mínimo 10 caracteres)</Label>
          <Textarea
            rows={4}
            value={motivo}
            placeholder="Ex.: CNPJ inválido no payload, valor divergente do pedido original..."
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {motivo.trim().length}/10 caracteres
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivoValido || transicionar.isPending}
          >
            {transicionar.isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
