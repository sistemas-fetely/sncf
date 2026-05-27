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
import { XCircle } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";
import { useNavigate } from "react-router-dom";
import type { CamposDecisao } from "../FormDecisaoCredito";

interface Props {
  analise_id: string;
  campos: CamposDecisao;
}

export function ReprovarDialog({ analise_id, campos }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const navigate = useNavigate();
  const transicionar = useTransicionarAnalise();

  const motivoValido = motivo.trim().length >= 10;

  const handleConfirm = async () => {
    if (!motivoValido) return;
    await transicionar.mutateAsync({
      analise_id,
      acao: "reprovado",
      motivo: motivo.trim(),
      parecer_final: campos.parecer_final || motivo.trim(),
    });
    setOpen(false);
    navigate("/credito");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <XCircle className="h-4 w-4" />
          Reprovar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprovar análise</DialogTitle>
          <DialogDescription>
            Cliente entra em cooldown de 90 dias (próximas análises ponderam o motivo abaixo).
            Mariana repassa esse motivo pro lojista de forma humana.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Motivo da reprovação (mínimo 10 caracteres)</Label>
          <Textarea
            rows={4}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Cliente com histórico de protestos recentes (Serasa 3 registros). Risco elevado para a primeira compra de R$ 5.500."
          />
          <p className="text-xs text-muted-foreground">
            {motivo.trim().length}/10 caracteres
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivoValido || transicionar.isPending}
          >
            {transicionar.isPending ? "Reprovando..." : "Confirmar reprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
