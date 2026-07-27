import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno?: string | null;
  cliente?: string | null;
  origem: "estoque_inadimplente" | "manual";
  /** Linha de contexto extra (ex.: "R$ 123 vencido · 30 dias") */
  contexto?: string | null;
  /** Chaves de query a invalidar após sucesso */
  invalidateKeys?: string[][];
}

export function MigrarParaComercialDialog({
  open,
  onOpenChange,
  pedidoId,
  idExterno,
  cliente,
  origem,
  contexto,
  invalidateKeys = [],
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const qc = useQueryClient();

  const motivoTrim = motivo.trim();
  const motivoValido = motivoTrim.length >= 5;

  async function handleConfirmar() {
    setErro(null);
    if (!motivoValido) {
      setErro("Descreva o motivo em pelo menos 5 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      const { data, error } = await (supabase as any).rpc(
        "migrar_para_oportunidade_comercial",
        { p_pedido_id: pedidoId, p_motivo: motivoTrim, p_origem: origem },
      );
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro || "Falha ao migrar");

      toast.success("Pedido migrado para Oportunidades", {
        description: "Saiu da fila do SOPs e agora vive no Comercial até alguém retomar.",
      });
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["oportunidades-comercial"] });
      setMotivo("");
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || "Erro desconhecido";
      setErro(msg);
      toast.error("Não foi possível migrar", { description: msg });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Migrar para Oportunidade Comercial</DialogTitle>
          <DialogDescription>
            O pedido{" "}
            <span className="font-mono text-foreground">{idExterno || pedidoId.slice(0, 8)}</span>
            {cliente ? <> — <span className="font-medium text-foreground">{cliente}</span></> : null}
            {" "}sai da fila do SOPs e passa a viver na tela de Oportunidades do
            Comercial até alguém retomar.
          </DialogDescription>
        </DialogHeader>

        {contexto && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{contexto}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="motivo-migrar">
            Motivo <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="motivo-migrar"
            placeholder="Explique brevemente por que este pedido vai para o Comercial (mínimo 5 caracteres)."
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (erro) setErro(null);
            }}
            disabled={enviando}
            rows={3}
          />
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={enviando || !motivoValido}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Migrar para Comercial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
