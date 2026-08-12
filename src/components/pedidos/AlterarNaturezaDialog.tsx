import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useNaturezasOperacao } from "@/hooks/pedidos/useNaturezasOperacao";
import { useAlterarNaturezaPedido } from "@/hooks/pedidos/useAlterarNaturezaPedido";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  /** Natureza atual do pedido. */
  codigoAtual?: string | null;
  /** Pré-seleção vinda do banner de incoerência. */
  codigoSugerido?: string | null;
  /** Foca direto o campo de motivo (caminho do banner). */
  focarMotivo?: boolean;
}

export function AlterarNaturezaDialog({
  open,
  onOpenChange,
  pedidoId,
  codigoAtual,
  codigoSugerido,
  focarMotivo,
}: Props) {
  const { data: naturezas, isLoading } = useNaturezasOperacao();
  const alterar = useAlterarNaturezaPedido();
  const [codigo, setCodigo] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const motivoRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCodigo(codigoSugerido ?? codigoAtual ?? "");
    setMotivo("");
    if (focarMotivo) {
      const t = setTimeout(() => motivoRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, codigoSugerido, codigoAtual, focarMotivo]);

  const escolhida = (naturezas ?? []).find((n) => n.codigo === codigo);
  const motivoOk = motivo.trim().length >= 3;
  const podeConfirmar = !!codigo && motivoOk && !alterar.isPending;

  const confirmar = () => {
    if (!podeConfirmar) return;
    alterar.mutate(
      { pedidoId, naturezaCodigo: codigo, motivo: motivo.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trocar natureza de operação</DialogTitle>
          <DialogDescription>
            A natureza decide se o pedido gera cobrança, se entra na receita e como é
            precificado. A troca fica registrada na timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Natureza</Label>
            <Select value={codigo} onValueChange={setCodigo} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione"} />
              </SelectTrigger>
              <SelectContent>
                {(naturezas ?? []).map((n) => (
                  <SelectItem key={n.codigo} value={n.codigo}>
                    {n.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {escolhida && (
              <p className="text-xs text-muted-foreground">
                {escolhida.gera_titulo_receber
                  ? "gera título a receber"
                  : "não gera título — roteia sem cobrança"}
              </p>
            )}
          </div>

          {escolhida && !escolhida.gera_titulo_receber && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 !text-amber-600" />
              <AlertDescription>
                Este pedido deixará de gerar cobrança e vai direto para separação.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="motivo-natureza">Motivo (obrigatório)</Label>
            <Textarea
              id="motivo-natureza"
              ref={motivoRef}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que a natureza está sendo trocada?"
              rows={3}
            />
            <p className={`text-xs ${motivoOk ? "text-muted-foreground" : "text-destructive"}`}>
              {motivo.trim().length}/3 caracteres mínimos
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {alterar.isPending ? "Alterando..." : "Confirmar troca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
