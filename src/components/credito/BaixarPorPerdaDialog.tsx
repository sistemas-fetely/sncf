import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";

interface Props {
  tituloId: string;
  numeroTitulo: string;
  valor: number;
  open: boolean;
  onClose: () => void;
}

export function BaixarPorPerdaDialog({
  tituloId, numeroTitulo, valor, open, onClose,
}: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("baixar_titulo_por_perda", {
        p_titulo_id: tituloId,
        p_motivo: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao baixar por perda.");
      return data as {
        ok: true;
        numero_titulo: string;
        status: "baixado_por_perda";
        boleto_baixa_solicitada: boolean;
        valor: number;
      };
    },
    onSuccess: (data) => {
      toast.success(`Título ${data.numero_titulo} → ${data.status}`, {
        description: formatBRL(data.valor),
      });
      if (data.boleto_baixa_solicitada) {
        toast.warning("Gere a Remessa de Baixa na Aba Banco para matar o boleto no Safra.", {
          duration: 10000,
        });
      }
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeConfirmar = motivo.trim().length >= 5 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Baixar por perda — {numeroTitulo}</DialogTitle>
          <DialogDescription>
            Valor: <strong>{formatBRL(valor)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4 !text-red-700" />
          <AlertDescription className="text-xs text-red-900">
            Reconhece este título como <strong>incobrável (write-off)</strong>. A venda/NF
            permanece; o boleto vivo será baixado no banco. <strong>Não gera haver.</strong>
          </AlertDescription>
        </Alert>

        <div className="space-y-2 mt-2">
          <Label>Motivo (obrigatório)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique o motivo da perda..."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Baixando..." : "Confirmar perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
