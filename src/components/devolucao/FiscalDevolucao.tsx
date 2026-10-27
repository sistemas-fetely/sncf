import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  finalidade: string | null; reenvio_status: string | null; reenvio_erro: string | null;
  nf_substituta_numero: string | null; chamado_id: string | null;
};

const sb = supabase as any;
const ddMMHHmm = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// 21/10/2026 (Flavio): o caminho fiscal vale para qualquer canal — a view expõe fiscal_acao.
export function useFiscalDevolucao(devolucaoId: string) {
  return useQuery({
    queryKey: ["devolucao-fiscal", devolucaoId],
    queryFn: async (): Promise<FiscalDevolucao> => {
      const { data: d, error } = await sb.from("devolucao").select("id,fiscal_acao,nf_original_id,pedido_id,finalidade,reenvio_status,reenvio_erro,nf_substituta_id,chamado_id").eq("id", devolucaoId).maybeSingle();
      if (error) throw error;
      if (!d) throw new Error("Devolução não encontrada.");
      const [nfR, pedR, subR] = await Promise.all([
        d.nf_original_id ? sb.from("nfs_emitidas").select("numero,situacao,autorizada_em,emitida_em,data_emissao").eq("id", d.nf_original_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        d.pedido_id ? sb.from("pedidos").select("id_externo").eq("id", d.pedido_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        d.nf_substituta_id ? sb.from("nfs_emitidas").select("numero").eq("id", d.nf_substituta_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (subR.error) throw subR.error;
      if (nfR.error) throw nfR.error;
      if (pedR.error) throw pedR.error;
      const nf = nfR.data as any;
      // CORRIGIR-NF (27/10/2026): o prazo de 24h conta da emissão da NF original (fallback autorização, depois data de emissão).
      const base = nf?.emitida_em ?? nf?.autorizada_em ?? nf?.data_emissao ?? null;
      const prazo = d.fiscal_acao === "cancelar_nf" && base ? new Date(new Date(base).getTime() + 24 * 3600_000).toISOString() : null;
      return { id: d.id, fiscal_acao: d.fiscal_acao, pedido_ref: pedR.data?.id_externo ?? null, nf_numero: nf?.numero != null ? String(nf.numero) : null, nf_situacao: nf?.situacao ?? null, prazo,
        finalidade: d.finalidade ?? null, reenvio_status: d.reenvio_status ?? null, reenvio_erro: d.reenvio_erro ?? null,
        nf_substituta_numero: subR.data?.numero != null ? String(subR.data.numero) : null, chamado_id: d.chamado_id ?? null };
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
  const refaturar = q.data?.finalidade === "refaturar";
  const confirmar = temCapturada && !refaturar ? <ConfirmarVinculo vinculoId={vinculoSugeridoId!} nfNumero={nfRetornoSugerida ?? null} grauSugerido={grauSugerido ?? null} onMudou={onMudou} /> : null;
  const mudou = () => { void q.refetch(); void onMudou?.(); };
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (q.isError) return <div className="text-sm text-destructive">{rawMessage(q.error)}</div>;
  const f = q.data!;
  const nf = f.nf_numero ?? "?";
  if (refaturar) return <BlocoRefaturar f={f} nfResolvida={nfResolvida} mudou={mudou} />;
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

const REENVIO_TXT: Record<string, string> = {
  aguardando_anulacao: "Aguardando anular a NF original",
  enviando: "Reenviando ao Bling…",
  enviado: "Pedido reenviado — aguardando a NF nova",
};

function AcaoRpc({ rotulo, rpc, devolucaoId, confirmar, descricao, variant = "outline", onFeito }: {
  rotulo: string; rpc: string; devolucaoId: string; confirmar?: string; descricao?: string;
  variant?: "outline" | "default"; onFeito: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const rodar = async () => {
    setRodando(true);
    try {
      const { data, error } = await sb.rpc(rpc, { p_devolucao_id: devolucaoId });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.erro ?? "O banco recusou a ação.");
      toast.success(data?.mensagem ?? `${rotulo}: feito`);
      setAberto(false);
      onFeito();
    } catch (e) { toast.error(rawMessage(e)); } finally { setRodando(false); }
  };
  if (!confirmar) {
    return <Button size="sm" variant={variant} onClick={rodar} disabled={rodando}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{rotulo}</Button>;
  }
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setAberto(true)}>{rotulo}</Button>
      <Dialog open={aberto} onOpenChange={(o) => { if (!rodando) setAberto(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmar}</DialogTitle>{descricao && <DialogDescription>{descricao}</DialogDescription>}</DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
            <Button onClick={rodar} disabled={rodando}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// CORRIGIR-NF / REFATURAR (27/10/2026): correção fiscal — sem NF de retorno do cliente; o banco reenvia o pedido sozinho.
function BlocoRefaturar({ f, nfResolvida, mudou }: { f: FiscalDevolucao; nfResolvida: boolean; mudou: () => void }) {
  const nf = f.nf_numero ?? "?";
  const st = f.reenvio_status;
  const statusTxt = st === "concluido" ? `Concluída — NF nova nº ${f.nf_substituta_numero ?? "?"}`
    : st === "erro" ? `Reenvio com erro: ${f.reenvio_erro ?? "sem detalhe"}`
    : st ? (REENVIO_TXT[st] ?? st) : null;
  const cancelada = nfResolvida || f.nf_situacao === "cancelada";
  const expirou = f.fiscal_acao === "cancelar_nf" && !cancelada && !!f.prazo && Date.now() > new Date(f.prazo).getTime();
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">Correção de NF</Badge>
        {f.chamado_id && <Link to={`/chamados/${f.chamado_id}`} className="text-xs text-primary underline-offset-2 hover:underline">Ver chamado</Link>}
      </div>
      {f.fiscal_acao === "cancelar_nf" && (cancelada
        ? <div className="text-success">NF nº {nf} cancelada.</div>
        : <>
            <div><span className="font-medium">Fiscal:</span> cancelar a NF nº {nf} no Bling até {f.prazo ? ddMMHHmm(f.prazo) : "—"}</div>
            {expirou && (
              <div className="space-y-2">
                <Alert variant="destructive"><AlertDescription>Prazo de cancelamento vencido.</AlertDescription></Alert>
                <AcaoRpc rotulo="Trocar para NF de entrada" rpc="fn_refaturar_trocar_para_nf_entrada" devolucaoId={f.id}
                  confirmar="Trocar para NF de entrada?" descricao="O caminho passa a ser a NF de entrada (sem retorno físico); o Fiscal autoriza no Bling e o sistema reenvia o pedido." onFeito={mudou} />
              </div>
            )}
          </>)}
      {(f.fiscal_acao === "nf_devolucao" || f.fiscal_acao === "nota_credito") && (
        <NfDevolucaoBloco devolucaoId={f.id} nf={nf} onMudou={mudou} {...(f.fiscal_acao === "nota_credito" ? { documento: "nota_credito" as const } : {})} />
      )}
      {statusTxt && (
        <div className={`rounded-md border p-2 ${st === "erro" ? "border-destructive/40 text-destructive" : st === "concluido" ? "text-success" : "bg-muted/30"}`}>
          <div>{statusTxt}</div>
          {st === "erro" && <div className="mt-2"><AcaoRpc rotulo="Tentar reenvio de novo" rpc="fn_refaturar_retentar_reenvio" devolucaoId={f.id} onFeito={mudou} /></div>}
        </div>
      )}
    </div>
  );
}
