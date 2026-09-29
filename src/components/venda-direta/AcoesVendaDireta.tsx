import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { useAdquirentes } from "@/hooks/financeiro/useAdquirentes";
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

export const QK_VD_GESTAO = ["venda-direta-gestao"] as const;

export interface LinhaVD {
  id: string;
  id_externo: string | null;
  valor_liquido: number | null;
  cliente_nome: string | null;
}

function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ConfirmarCartaoDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: adquirentes = [] } = useAdquirentes(!!linha);
  const [nsu, setNsu] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(agoraLocal());
  const [adq, setAdq] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (linha) {
      setNsu(""); setValor(String(linha.valor_liquido ?? "")); setData(agoraLocal()); setAdq(""); setObs("");
    }
  }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("confirmar_cartao_capturado" as never, {
        p_pedido_id: linha!.id,
        p_nsu: nsu.trim(),
        p_data_captura: new Date(data).toISOString(),
        p_valor_capturado: Number(valor.replace(",", ".")),
        p_observacao: obs.trim() || null,
        p_adquirente_id: adq || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Cartão confirmado em ${linha?.id_externo ?? ""}`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const valorNum = Number(valor.replace(",", "."));
  const pode = nsu.trim() !== "" && valorNum > 0 && !!data;

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar cartão · {linha?.id_externo}</DialogTitle>
          <DialogDescription>
            {linha?.cliente_nome} · total {formatBRL(linha?.valor_liquido)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>NSU *</Label><Input value={nsu} onChange={(e) => setNsu(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Valor capturado</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
            <div className="space-y-1"><Label>Data da captura</Label><Input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <Label>Adquirente</Label>
            <Select value={adq} onValueChange={setAdq}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {adquirentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!pode || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrarRetiradaDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
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
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
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
