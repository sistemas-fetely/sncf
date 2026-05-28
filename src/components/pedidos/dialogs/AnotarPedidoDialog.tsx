import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquarePlus } from "lucide-react";
import { useRegistrarEventoPedido } from "@/hooks/pedidos/useRegistrarEventoPedido";

interface Props {
  pedido_id: string;
}

export function AnotarPedidoDialog({ pedido_id }: Props) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const registrar = useRegistrarEventoPedido();

  const textoValido = texto.trim().length >= 3;

  const handleConfirm = async () => {
    if (!textoValido) return;
    await registrar.mutateAsync({
      pedido_id,
      tipo_evento: "anotacao",
      descricao: texto.trim(),
    });
    setOpen(false);
    setTexto("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Anotar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anotação</DialogTitle>
          <DialogDescription>
            Vai parar no timeline do pedido. Use pra registrar contato com cliente,
            problemas detectados, contexto que pode importar depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Anotação</Label>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: Liguei pro cliente, ele pede mais 24h pro pix"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!textoValido || registrar.isPending}>
            {registrar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
