import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Undo2 } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";
import { useNavigate } from "react-router-dom";

interface Props {
  analise_id: string;
}

export function DevolverParaAnaliseDialog({ analise_id }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const navigate = useNavigate();
  const transicionar = useTransicionarAnalise();

  const motivoValido = motivo.trim().length >= 10;

  const handleConfirm = async () => {
    if (!motivoValido) return;
    await transicionar.mutateAsync({
      analise_id,
      acao: "devolvido",
      estagio_destino: "analise",
      motivo: motivo.trim(),
    });
    setOpen(false);
    navigate("/credito");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Undo2 className="h-4 w-4" />
          Devolver pra Análise
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver pra Análise</DialogTitle>
          <DialogDescription>
            Use quando precisar de mais informação do Time (anexar BVG faltando,
            esclarecer ponto na IA, etc.). A análise volta pro estágio Análise com o motivo abaixo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Motivo (mínimo 10 caracteres)</Label>
          <Textarea
            rows={4}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Falta anexar Boa Vista. Pedido acima de R$ 5k merece os dois bureaus pra decisão segura."
          />
          <p className="text-xs text-muted-foreground">
            {motivo.trim().length}/10 caracteres
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button onClick={handleConfirm} disabled={!motivoValido || transicionar.isPending}>
            {transicionar.isPending ? "Devolvendo..." : "Confirmar devolução"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
