import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Eraser } from "lucide-react";
import { toast } from "sonner";
import { formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Furo = {
  id: string;
  doc_solicitado_em?: string | null;
  doc_solicitado_nota?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  furo: Furo | null;
  onDone: () => void;
}

export function SolicitarDocumentoDialog({ open, onOpenChange, furo, onDone }: Props) {
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [limpando, setLimpando] = useState(false);

  useEffect(() => {
    if (open) setNota(furo?.doc_solicitado_nota || "");
  }, [open, furo]);

  async function salvar() {
    if (!furo) return;
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada — refaça o login");
      const { error } = await sb
        .from("movimentacoes_bancarias")
        .update({
          doc_solicitado_em: new Date().toISOString(),
          doc_solicitado_por: uid,
          doc_solicitado_nota: nota || null,
        })
        .eq("id", furo.id);
      if (error) throw error;
      toast.success("Solicitação registrada");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  async function limpar() {
    if (!furo) return;
    setLimpando(true);
    try {
      const { error } = await sb
        .from("movimentacoes_bancarias")
        .update({
          doc_solicitado_em: null,
          doc_solicitado_por: null,
          doc_solicitado_nota: null,
        })
        .eq("id", furo.id);
      if (error) throw error;
      toast.success("Solicitação removida");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLimpando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar documento</DialogTitle>
          <DialogDescription>
            {furo?.doc_solicitado_em
              ? <>Solicitado em {formatDateBR(furo.doc_solicitado_em)}</>
              : "Registre uma nota do pedido (ex.: fatura pedida à contabilidade)"}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="fatura pedida à contabilidade"
          rows={4}
        />

        <DialogFooter className="gap-2">
          {furo?.doc_solicitado_em && (
            <Button
              variant="outline"
              onClick={limpar}
              disabled={limpando || salvando}
              className="gap-1 mr-auto"
            >
              {limpando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
              Limpar solicitação
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando || limpando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || limpando} className="gap-1">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
