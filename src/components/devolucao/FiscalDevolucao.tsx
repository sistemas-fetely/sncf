import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NfDevolucaoBloco } from "./NfDevolucaoBloco";

type FiscalSP = {
  id: string; fiscal_acao: "cancelar_nf" | "nf_devolucao" | null; pedido_ref: string | null;
  nf_numero: string | null; nf_situacao: string | null; prazo: string | null;
};

const sb = supabase as any;
const ddMMHHmm = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function useFiscalSiteSp(devolucaoId: string) {
  return useQuery({
    queryKey: ["devolucao-fiscal-site-sp", devolucaoId],
    queryFn: async (): Promise<FiscalSP> => {
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

export function BlocoFiscalSiteSp({ devolucaoId, nfResolvida }: { devolucaoId: string; nfResolvida: boolean }) {
  const q = useFiscalSiteSp(devolucaoId);
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
    return <NfDevolucaoBloco devolucaoId={devolucaoId} nf={nf} onMudou={() => q.refetch()} />;
  }
  return <div className="text-sm text-muted-foreground">Sem ação fiscal registrada.</div>;
}
