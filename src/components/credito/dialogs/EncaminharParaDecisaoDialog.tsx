import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";

interface Props {
  analise_id: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function EncaminharParaDecisaoDialog({ analise_id, disabled, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const transicionar = useTransicionarAnalise();

  const handleConfirm = async () => {
    await transicionar.mutateAsync({ analise_id, acao: "encaminhado" });
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button className="gap-2" disabled={disabled} title={disabledReason}>
          <ArrowRight className="h-4 w-4" />
          Encaminhar pra Decisão
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encaminhar pra Decisão?</AlertDialogTitle>
          <AlertDialogDescription>
            Joseph vai receber o caso com tudo pronto — bureau extraído, análise IA gerada e
            sugestão estruturada. Esta análise sai da sua fila.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={transicionar.isPending}>
            {transicionar.isPending ? "Encaminhando..." : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
