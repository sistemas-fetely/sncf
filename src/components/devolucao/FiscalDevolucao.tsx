import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { NfDevolucaoBloco } from "./NfDevolucaoBloco";

type FiscalDevolucao = {
  id: string; fiscal_acao: "cancelar_nf" | "nf_devolucao" | "nota_credito" | null; pedido_ref: string | null;
  nf_numero: string | null; nf_situacao: string | null; prazo: string | null;
};

const sb = supabase as any;
const ddMMHHmm = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// 21/10/2026 (Flavio): o caminho fiscal vale para qualquer canal — a view expõe fiscal_acao.
export function useFiscalDevolucao(devolucaoId: string) {
  return useQuery({
    queryKey: ["devolucao-fiscal", devolucaoId],
    queryFn: async (): Promise<FiscalDevolucao> => {
      const { data: d, error } = await sb.from("devolucao").select("id,fiscal_acao,nf_original_id,pedido_id").eq("id", devolucaoId).maybeSingle();
      if (error) throw error;
      if (!d) throw new Error("Devolução não encontrada.");
      const [nfR, pedR] = await Promise.all([
        d.nf_original_id ? sb.from("nfs_emitidas").select("numero,situacao,autorizada_em,emitida_em,data_emissao").eq("id", d.nf_original_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        d.pedido_id ? sb.from("pedidos").select("id_externo").eq("id", d.pedido_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (nfR.error) throw nfR.error;
      if (pedR.error) throw pedR.error;
      const nf = nfR.data as any;
      const base = nf?.autorizada_em ?? nf?.emitida_em ?? nf?.data_emissao ?? null;
      const prazo = d.fiscal_acao === "cancelar_nf" && base ? new Date(new Date(base).getTime() + 24 * 3600_000).toISOString() : null;
      return { id: d.id, fiscal_acao: d.fiscal_acao, pedido_ref: pedR.data?.id_externo ?? null, nf_numero: nf?.numero != null ? String(nf.numero) : null, nf_situacao: nf?.situacao ?? null, prazo };
    },
  });
}

type PropsBloco = {
  devolucaoId: string; nfResolvida: boolean;
  vinculoSugeridoId?: string | null; nfRetornoSugerida?: string | null; grauSugerido?: string | null;
  onMudou?: () => Promise<void> | void;
};

function ConfirmarVinculo({ vinculoId, nfNumero, grauSugerido, onMudou }: { vinculoId: string; nfNumero: string | null; grauSugerido: string | null; onMudou?: () => Promise<void> | void }) {
  const inicial = grauSugerido === "parcial" ? "parcial" : "total";
  const [aberto, setAberto] = useState(false);
  const [grau, setGrau] = useState(inicial);
  const [motivo, setMotivo] = useState("");
  const [rodando, setRodando] = useState(false);
  const confirmar = async () => {
    setRodando(true);
    try {
      const { data, error } = await sb.rpc("fn_devolucao_confirmar_vinculo", { p_vinculo_id: vinculoId, p_grau: grau, p_motivo: motivo.trim() || null });
      if (error) throw error;
      if (data?.ok === false) { toast.error(data.erro ?? "O banco recusou a confirmação."); return; }
      toast.success(`NF de retorno ${nfNumero ?? ""} confirmada (${grau})`);
      setAberto(false);
      await onMudou?.();
    } catch (e) { toast.error(rawMessage(e)); } finally { setRodando(false); }
  };
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2 text-sm">
      <div>NF de retorno <span className="font-semibold">{nfNumero ?? "?"}</span> capturada do Bling — aguardando confirmação</div>
      <Button size="sm" onClick={() => { setGrau(inicial); setMotivo(""); setAberto(true); }}>Confirmar NF de retorno</Button>
      <Dialog open={aberto} onOpenChange={(o) => { if (!o && !rodando) setAberto(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar NF de retorno {nfNumero ?? ""}</DialogTitle><DialogDescription>Vincula a NF capturada do Bling a esta devolução.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Grau</Label>
              <RadioGroup value={grau} onValueChange={setGrau} className="flex gap-4">
                <label className="flex items-center gap-2"><RadioGroupItem value="total" />Total</label>
                <label className="flex items-center gap-2"><RadioGroupItem value="parcial" />Parcial</label>
              </RadioGroup>
            </div>
            <div className="space-y-1"><Label>Motivo (opcional)</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={rodando}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BlocoFiscalDevolucao({ devolucaoId, nfResolvida, vinculoSugeridoId, nfRetornoSugerida, grauSugerido, onMudou }: PropsBloco) {
  const q = useFiscalDevolucao(devolucaoId);
  const temCapturada = !!vinculoSugeridoId && !nfResolvida;
  const confirmar = temCapturada ? <ConfirmarVinculo vinculoId={vinculoSugeridoId!} nfNumero={nfRetornoSugerida ?? null} grauSugerido={grauSugerido ?? null} onMudou={onMudou} /> : null;
  const mudou = () => { void q.refetch(); void onMudou?.(); };
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (q.isError) return <div className="text-sm text-destructive">{rawMessage(q.error)}</div>;
  const f = q.data!;
  const nf = f.nf_numero ?? "?";
  if (f.fiscal_acao === "cancelar_nf") {
    const cancelada = nfResolvida || f.nf_situacao === "cancelada";
    const expirou = !cancelada && !!f.prazo && Date.now() > new Date(f.prazo).getTime();
    const just = `Cancelamento a pedido do cliente — pedido ${f.pedido_ref ?? ""} — mercadoria não saiu do estabelecimento.`;
    return (
      <div className="space-y-2 text-sm">
        {cancelada ? <div className="text-success">NF nº {nf} cancelada.</div> : <>
          <div><span className="font-medium">Eva:</span> cancelar a NF nº {nf} no Bling até {f.prazo ? ddMMHHmm(f.prazo) : "—"}</div>
          <div className="flex items-start gap-2 rounded-md border bg-card p-2">
            <span className="flex-1 text-xs">{just}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copiar justificativa" onClick={async () => { try { await navigator.clipboard.writeText(just); toast.success("Justificativa copiada"); } catch (e) { toast.error(rawMessage(e)); } }}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="text-xs text-muted-foreground">A etapa se resolve sozinha quando a NF aparecer cancelada no SNCF.</div>
          {expirou && <Alert variant="destructive"><AlertDescription>Prazo de cancelamento expirou — emitir NF de devolução</AlertDescription></Alert>}
        </>}
      </div>
    );
  }
  if (f.fiscal_acao === "nf_devolucao") {
    return <div className="space-y-2">{confirmar}<NfDevolucaoBloco devolucaoId={devolucaoId} nf={nf} onMudou={mudou} ocultarGerar={temCapturada} /></div>;
  }
  if (f.fiscal_acao === "nota_credito") {
    return <div className="space-y-2">{confirmar}<NfDevolucaoBloco devolucaoId={devolucaoId} nf={nf} onMudou={mudou} documento="nota_credito" ocultarGerar={temCapturada} /></div>;
  }
  return confirmar ?? <div className="text-sm text-muted-foreground">Sem ação fiscal registrada.</div>;
}
