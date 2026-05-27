import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";

interface Props {
  analise_id: string;
}

export function EncaminharDialog({ analise_id }: Props) {
  const [open, setOpen] = useState(false);
  const transicionar = useTransicionarAnalise();

  const handleConfirm = async () => {
    await transicionar.mutateAsync({
      analise_id,
      acao: "encaminhado",
    });
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Encaminhar pra Análise
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encaminhar pra Análise?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido vai pra fila do Time Joseph. Eles anexam Serasa/Boa Vista,
            a IA processa, e Joseph decide. Você pode acompanhar pelo dashboard.
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
