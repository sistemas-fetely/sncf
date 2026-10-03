import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LinhaVD } from "./AcoesVendaDireta";
import { invalidarVendaDireta } from "./queryKeys";

export const QK_VD_DEVOLUCOES = ["vd-devolucoes"] as const;
export type StatusDevolucao = "solicitada" | "recusada" | "aprovada" | "aguardando_devolucao" | "estorno_enviado" | "concluida" | "falhou";
export interface DevolucaoVD {
  id: string; pedido_id: string; meio: "pix" | "cartao"; valor: number; status: StatusDevolucao;
  motivo_solicitacao: string; solicitado_por: string | null; solicitado_em: string; decidido_por: string | null;
  decidido_em: string | null; motivo_decisao: string | null; charge_id: string | null; prova_tipo: string | null;
  prova_ref: string | null; erro: string | null; haver_id: string | null; concluido_em: string | null;
  pedido?: { id_externo: string | null; cliente_nome_snapshot: string | null; parceiros_comerciais?: { razao_social: string | null } | null } | null;
  solicitante?: string | null; decisor?: string | null; prova_pagamento?: string | null;
  devolucao_id?: string | null; bling_status?: string | null; bling_erro?: string | null; comprovante_token?: string | null;
}

export const DEVOLUCAO_ATIVA = new Set<StatusDevolucao>(["solicitada", "aprovada", "aguardando_devolucao", "estorno_enviado", "falhou"]);
export const nomeCliente = (pedido: DevolucaoVD["pedido"]) => pedido?.parceiros_comerciais?.razao_social?.trim() || pedido?.cliente_nome_snapshot?.trim() || null;
export const ROTULO_DEVOLUCAO: Record<StatusDevolucao, string> = {
  solicitada: "Solicitada", recusada: "Recusada", aprovada: "Aprovada", aguardando_devolucao: "Aguardando devolução", estorno_enviado: "Reembolso em curso", concluida: "Concluída", falhou: "Falhou",
};
const dataHora = (v: string | null) => v ? new Date(v).toLocaleString("pt-BR") : "—";

export function useDevolucoesVD() {
  return useQuery({
    queryKey: QK_VD_DEVOLUCOES,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DevolucaoVD[]> => {
      const { data, error } = await supabase.from("vd_devolucao" as never).select("*").order("solicitado_em", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as DevolucaoVD[];
      const pids = [...new Set(rows.map((r) => r.pedido_id))];
      const uids = [...new Set(rows.flatMap((r) => [r.solicitado_por, r.decidido_por]).filter((v): v is string => !!v))];
      const [pedR, profR, provR, filaR] = await Promise.all([
        pids.length ? supabase.from("pedidos" as never).select("id,id_externo,cliente_nome_snapshot,parceiros_comerciais!pedidos_parceiro_id_fkey(razao_social)").in("id", pids) : Promise.resolve({ data: [], error: null }),
        uids.length ? supabase.from("profiles").select("user_id,full_name").in("user_id", uids) : Promise.resolve({ data: [], error: null }),
        pids.length ? supabase.from("provisao_recebimento" as never).select("pedido_id,prova_ref,pago_em").in("pedido_id", pids).not("pago_em", "is", null) : Promise.resolve({ data: [], error: null }),
        pids.length ? supabase.from("bling_situacao_fila" as never).select("pedido_id,status,ultimo_erro,criado_em").in("pedido_id", pids).order("criado_em", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [pedR, profR, provR, filaR]) if (r.error) throw r.error;
      const pedidos = new Map(((pedR.data ?? []) as any[]).map((p) => [p.id, p]));
      const nomes = new Map(((profR.data ?? []) as any[]).map((p) => [p.user_id, p.full_name]));
      const provas = new Map<string, string>(); for (const p of (provR.data ?? []) as any[]) if (!provas.has(p.pedido_id)) provas.set(p.pedido_id, p.prova_ref);
      const filas = new Map<string, any>(); for (const f of (filaR.data ?? []) as any[]) if (!filas.has(f.pedido_id)) filas.set(f.pedido_id, f);
      return rows.map((r) => ({ ...r, pedido: pedidos.get(r.pedido_id), solicitante: nomes.get(r.solicitado_por ?? "") ?? null, decisor: nomes.get(r.decidido_por ?? "") ?? null, prova_pagamento: provas.get(r.pedido_id) ?? null, bling_status: filas.get(r.pedido_id)?.status ?? null, bling_erro: filas.get(r.pedido_id)?.ultimo_erro ?? null }));
    },
  });
}

export function SolicitarDevolucaoDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient(); const [motivo, setMotivo] = useState("");
  useEffect(() => { if (linha) setMotivo(""); }, [linha]);
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("vd_solicitar_devolucao" as never, { p_pedido_id: linha?.id, p_motivo: motivo.trim() } as never); if (error) throw error; },
    onSuccess: async () => { toast.success("Cancelamento com reembolso solicitado à equipe de SOPs"); await Promise.all([invalidarVendaDireta(qc), qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES })]); onClose(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}><DialogContent><DialogHeader><DialogTitle>Solicitar cancelamento com reembolso · {linha?.id_externo}</DialogTitle><DialogDescription>O cliente pagou {formatBRL(linha?.valor_liquido)} por {linha?.pagamento === "pix" ? "PIX" : "cartão"}. A equipe de SOPs executa o reembolso; depois o pedido é cancelado aqui e no Bling.</DialogDescription></DialogHeader><div className="space-y-1"><Label>Motivo *</Label><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Mínimo de 5 caracteres" /></div><DialogFooter><Button variant="outline" onClick={onClose}>Voltar</Button><Button onClick={() => m.mutate()} disabled={motivo.trim().length < 5 || m.isPending}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar cancelamento com reembolso</Button></DialogFooter></DialogContent></Dialog>;
}

export function BotoesComprovante({ devolucao }: { devolucao: DevolucaoVD }) {
  if (devolucao.status !== "concluida") return null;
  if (!devolucao.comprovante_token) return <div className="text-xs text-muted-foreground">Comprovante ainda não disponível.</div>;
  const url = `https://sncf.lovable.app/reembolso/${devolucao.comprovante_token}`;
  const primeiro = (devolucao.pedido?.cliente_nome_snapshot ?? "").trim().split(/\s+/)[0] || "cliente";
  const msg = `Olá ${primeiro}! O reembolso do seu pedido ${devolucao.pedido?.id_externo ?? ""} na Fetely, de ${formatBRL(devolucao.valor)}, foi realizado. Seu comprovante: ${url}`;
  return <div className="flex flex-wrap gap-2 pt-1">
    <Button asChild size="sm" variant="outline"><a href={`/reembolso/${devolucao.comprovante_token}`} target="_blank" rel="noopener noreferrer">Ver comprovante</a></Button>
    <Button asChild size="sm" variant="outline"><a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a></Button>
  </div>;
}

function AnexoDevolucao({ devolucao }: { devolucao: DevolucaoVD }) {
  const m = JSON.stringify(devolucao).match(/anexo: (devolucao\/[^\s"·\\]+)/);
  if (!m) return null;
  const abrir = async () => {
    const { data, error } = await supabase.storage.from("comprovantes-pagamento").createSignedUrl(m[1], 600);
    if (error || !data) { toast.error(error?.message ?? "Não foi possível abrir o anexo"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  return <Button variant="link" className="h-auto p-0" onClick={() => void abrir()}>Ver comprovante da devolução (anexo)</Button>;
}

export function TrilhaDevolucao({ devolucao, mostrarLinkEsteira = true }: { devolucao: DevolucaoVD; mostrarLinkEsteira?: boolean }) {
  return <div className="space-y-2 rounded-md border bg-card p-3 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{ROTULO_DEVOLUCAO[devolucao.status]}</span><span className="tabular-nums">{formatBRL(devolucao.valor)}</span></div><div><span className="text-muted-foreground">Solicitada:</span> {dataHora(devolucao.solicitado_em)} · {devolucao.solicitante ?? "—"}</div><div className="text-muted-foreground">{devolucao.motivo_solicitacao}</div>{devolucao.decidido_em && <div><span className="text-muted-foreground">Decidida:</span> {dataHora(devolucao.decidido_em)} · {devolucao.decisor ?? "—"}{devolucao.motivo_decisao ? ` · ${devolucao.motivo_decisao}` : ""}</div>}{devolucao.concluido_em && <div><span className="text-muted-foreground">Concluída:</span> {dataHora(devolucao.concluido_em)} · prova {devolucao.prova_tipo ?? "—"} · {devolucao.prova_ref ?? "—"}</div>}{devolucao.erro && <div className="text-destructive">{devolucao.erro}</div>}<div><span className="text-muted-foreground">Bling:</span> {devolucao.bling_status ?? "sem envio"}{devolucao.bling_erro ? ` · ${devolucao.bling_erro}` : ""}</div><AnexoDevolucao devolucao={devolucao} /><BotoesComprovante devolucao={devolucao} />{mostrarLinkEsteira && <Button asChild variant="link" className="h-auto p-0"><Link to={devolucao.devolucao_id ? `/devolucoes?aba=funil&q=${encodeURIComponent(devolucao.pedido?.id_externo ?? "")}` : `/devolucoes?aba=reembolso&pedido=${devolucao.pedido_id}`}>Abrir na esteira de Devoluções</Link></Button>}</div>;
}