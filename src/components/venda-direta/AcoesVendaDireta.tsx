import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { useAdquirentes } from "@/hooks/financeiro/useAdquirentes";
import { useConfirmarPagamentoLinha } from "@/hooks/pedidos/useConfirmarPagamentoLinha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
export { QK_VD_GESTAO } from "@/components/venda-direta/queryKeys";
import { invalidarVendaDireta } from "@/components/venda-direta/queryKeys";


export interface LinhaVD {
  id: string;
  id_externo: string | null;
  valor_liquido: number | null;
  credito_aplicado?: number | null;
  valor_a_pagar?: number | null;
  cliente_nome: string | null;
  cliente_telefone?: string | null;
  provisao_id?: string | null;
  link_pagamento?: string | null;
  pagamento?: "pix" | "cartao" | "cartao_maquininha" | string | null;
}

export function RegistrarRetiradaDialog({ linha, onClose, onRegistrada }: { linha: LinhaVD | null; onClose: () => void; onRegistrada?: () => void }) {
  const qc = useQueryClient();
  const [quem, setQuem] = useState("");
  const [doc, setDoc] = useState("");
  useEffect(() => { if (linha) { setQuem(""); setDoc(""); } }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("vd_registrar_retirada" as never, {
        p_pedido_id: linha!.id,
        p_retirado_por: quem.trim(),
        p_documento: doc.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Retirada registrada em ${linha?.id_externo ?? ""}`);
      void invalidarVendaDireta(qc);
      onClose();
      onRegistrada?.();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar retirada · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Quem retirou *</Label><Input value={quem} onChange={(e) => setQuem(e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Documento</Label><Input value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!quem.trim() || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrarEntregaDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [quem, setQuem] = useState("");
  const [obs, setObs] = useState("");
  useEffect(() => { if (linha) { setQuem(""); setObs(""); } }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("vd_registrar_entrega" as never, {
        p_pedido_id: linha!.id,
        p_recebido_por: quem.trim(),
        p_observacao: obs.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Entrega registrada em ${linha?.id_externo ?? ""}`);
      void invalidarVendaDireta(qc);
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrega · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome} · Frete Fetely</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Recebido por *</Label><Input value={quem} onChange={(e) => setQuem(e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!quem.trim() || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
