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
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const ESTAGIO_LABEL: Record<string, string> = {
  aguardando_estoque: "Aguardando estoque",
  aguardando_pagamento: "Aguardando pagamento",
  cobranca: "Cobrança",
  pre_separacao: "Pré-separação",
  em_analise_credito: "Em análise de crédito",
  recepcao: "Recepção",
  triagem: "Triagem",
};

function traduzirEstagio(e: string | null | undefined): string {
  if (!e) return "estágio de origem";
  return ESTAGIO_LABEL[e] || e.replace(/_/g, " ");
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno?: string | null;
  cliente?: string | null;
  /** Estágio previsto de retomada (campo retomavel_para da view/pedido) */
  retomavelPara?: string | null;
  invalidateKeys?: string[][];
}

export function RetomarOportunidadeDialog({
  open,
  onOpenChange,
  pedidoId,
  idExterno,
  cliente,
  retomavelPara,
  invalidateKeys = [],
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const qc = useQueryClient();

  async function handleConfirmar() {
    setEnviando(true);
    try {
      const params: Record<string, unknown> = { p_pedido_id: pedidoId };
      const motivoTrim = motivo.trim();
      if (motivoTrim.length > 0) params.p_motivo = motivoTrim;

      const { data, error } = await (supabase as any).rpc("retomar_oportunidade", params);
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro || "Falha ao retomar");

      const destino = data?.destino as string | undefined;
      toast.success("Pedido retomado", {
        description: destino
          ? `Voltou para ${traduzirEstagio(destino)}${data?.usou_fallback ? " (fallback)" : ""}.`
          : "Voltou para a fila do SOPs.",
      });
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["oportunidades-comercial"] });
      setMotivo("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Não foi possível retomar", { description: e?.message || "Erro desconhecido" });
    } finally {
      setEnviando(false);
    }
  }

  const destinoLabel = traduzirEstagio(retomavelPara);

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retomar da Oportunidade Comercial</DialogTitle>
          <DialogDescription>
            O pedido{" "}
            <span className="font-mono text-foreground">{idExterno || pedidoId.slice(0, 8)}</span>
            {cliente ? <> — <span className="font-medium text-foreground">{cliente}</span></> : null}
            {" "}volta para a fila do SOPs e sai desta tela.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Vai voltar para
          </p>
          <Badge variant="outline" className="text-sm">{destinoLabel}</Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="motivo-retomar">Motivo (opcional)</Label>
          <Textarea
            id="motivo-retomar"
            placeholder="Se deixar em branco, o sistema registra um motivo padrão."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Retomar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
