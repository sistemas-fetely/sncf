import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LinhaVD } from "./AcoesVendaDireta";
import { invalidarVendaDireta } from "./queryKeys";
import { QK_VD_DEVOLUCOES } from "./DevolucaoVendaDireta";

export const QK_VD_CANCEL_NF = ["vd-cancelamento-com-nf"] as const;
export interface CancelamentoNfSP {
  id: string; pedido_id: string; numero: string | null; status: string | null;
  etapa: string; aberta: boolean;
}

const sb = supabase as any;
export const linkEsteiraNf = (idExterno: string | null | undefined) => `/devolucoes?aba=funil&q=${encodeURIComponent(idExterno ?? "")}`;

/** Devoluções canal site_sp (cancelamento com NF), por pedido. */
export function useCancelamentosComNfSP() {
  return useQuery({
    queryKey: QK_VD_CANCEL_NF,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Map<string, CancelamentoNfSP>> => {
      const { data: devs, error } = await sb.from("devolucao").select("id,pedido_id,numero,status").eq("canal", "site_sp").neq("status", "cancelada");
      if (error) throw error;
      const ids = ((devs ?? []) as any[]).map((d) => d.id);
      const out = new Map<string, CancelamentoNfSP>();
      if (!ids.length) return out;
      const [fR, sR] = await Promise.all([
        sb.from("vw_devolucao_funil").select("id,status,status_efetivo,pendencias_encerramento,e7_encerrada").in("id", ids),
        sb.from("devolucao_status").select("codigo,rotulo,eh_final"),
      ]);
      if (fR.error) throw fR.error;
      if (sR.error) throw sR.error;
      const funil = new Map(((fR.data ?? []) as any[]).map((f) => [f.id, f]));
      const st = new Map(((sR.data ?? []) as any[]).map((s) => [s.codigo, s]));
      for (const d of (devs ?? []) as any[]) {
        const f = funil.get(d.id);
        const cod = String(f?.status_efetivo ?? f?.status ?? d.status ?? "");
        const pend: string[] = f?.pendencias_encerramento ?? [];
        const aberta = !f?.e7_encerrada && st.get(cod)?.eh_final !== true;
        const etapa = [st.get(cod)?.rotulo ?? cod, pend.length ? `falta: ${pend.join(", ")}` : ""].filter(Boolean).join(" · ");
        if (d.pedido_id) out.set(d.pedido_id, { id: d.id, pedido_id: d.pedido_id, numero: d.numero, status: cod, etapa, aberta });
      }
      return out;
    },
  });
}

export function SolicitarCancelamentoComNfDialog({ linha, produtoSaiuPadrao, onClose }: { linha: LinhaVD | null; produtoSaiuPadrao: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState("");
  const [saiu, setSaiu] = useState<"sim" | "nao">("nao");
  useEffect(() => { if (linha) { setMotivo(""); setSaiu(produtoSaiuPadrao ? "sim" : "nao"); } }, [linha, produtoSaiuPadrao]);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("vd_abrir_cancelamento_com_nf" as never, { p_pedido_id: linha!.id, p_motivo: motivo.trim(), p_produto_saiu: saiu === "sim" } as never);
      if (error) throw error;
      return (data ?? {}) as { devolucao_numero?: string };
    },
    onSuccess: async (r) => {
      const ref = linha?.id_externo;
      toast.success(`Cancelamento com NF aberto: ${r.devolucao_numero ?? ""}`, { action: { label: "Abrir esteira", onClick: () => navigate(linkEsteiraNf(ref)) } });
      await Promise.all([invalidarVendaDireta(qc), qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES }), qc.invalidateQueries({ queryKey: QK_VD_CANCEL_NF })]);
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar cancelamento com NF · {linha?.id_externo}</DialogTitle>
          <DialogDescription>Só cancelamento total. A NF será cancelada (até 24h e produto ainda no Site SP) ou será emitida NF de devolução.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>O produto já saiu do Site SP?</Label>
            <ToggleGroup type="single" size="sm" variant="outline" value={saiu} onValueChange={(v) => v && setSaiu(v as "sim" | "nao")} className="justify-start">
              <ToggleGroupItem value="nao">Não</ToggleGroupItem>
              <ToggleGroupItem value="sim">Sim</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1"><Label>Motivo *</Label><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Mínimo de 5 caracteres" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Voltar</Button>
          <Button onClick={() => m.mutate()} disabled={motivo.trim().length < 5 || m.isPending}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar cancelamento com NF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SecaoCancelamentoNf({ c, idExterno }: { c: CancelamentoNfSP; idExterno: string | null }) {
  return (
    <div className="space-y-1 rounded-md border bg-card p-3 text-sm">
      <div className="font-medium">{c.numero ?? "—"}</div>
      <div className="text-muted-foreground">{c.etapa}</div>
      <Button asChild variant="link" className="h-auto p-0"><Link to={linkEsteiraNf(idExterno)}>Abrir na esteira de Devoluções</Link></Button>
    </div>
  );
}
