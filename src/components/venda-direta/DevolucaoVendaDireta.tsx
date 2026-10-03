import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QK_VD_GESTAO, type LinhaVD } from "./AcoesVendaDireta";

export const QK_VD_DEVOLUCOES = ["vd-devolucoes"] as const;
export type StatusDevolucao = "solicitada" | "recusada" | "aprovada" | "estorno_enviado" | "concluida" | "falhou";
export interface DevolucaoVD {
  id: string; pedido_id: string; meio: "pix" | "cartao"; valor: number; status: StatusDevolucao;
  motivo_solicitacao: string; solicitado_por: string | null; solicitado_em: string; decidido_por: string | null;
  decidido_em: string | null; motivo_decisao: string | null; charge_id: string | null; prova_tipo: string | null;
  prova_ref: string | null; erro: string | null; haver_id: string | null; concluido_em: string | null;
  pedido?: { id_externo: string | null; cliente_nome_snapshot: string | null } | null;
  solicitante?: string | null; decisor?: string | null; prova_pagamento?: string | null;
  bling_status?: string | null; bling_erro?: string | null;
}

export const DEVOLUCAO_ATIVA = new Set<StatusDevolucao>(["solicitada", "aprovada", "estorno_enviado", "falhou"]);
export const ROTULO_DEVOLUCAO: Record<StatusDevolucao, string> = {
  solicitada: "Solicitada", recusada: "Recusada", aprovada: "Aprovada", estorno_enviado: "Estorno enviado", concluida: "Concluída", falhou: "Falhou",
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
        pids.length ? supabase.from("pedidos" as never).select("id,id_externo,cliente_nome_snapshot").in("id", pids) : Promise.resolve({ data: [], error: null }),
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
    onSuccess: async () => { toast.success("Devolução solicitada ao Financeiro"); await Promise.all([qc.invalidateQueries({ queryKey: QK_VD_GESTAO }), qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES })]); onClose(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}><DialogContent><DialogHeader><DialogTitle>Solicitar devolução · {linha?.id_externo}</DialogTitle><DialogDescription>O cliente pagou {formatBRL(linha?.valor_liquido)} por {linha?.pagamento === "pix" ? "PIX" : "cartão"}. O Financeiro aprova e o dinheiro é devolvido; depois o pedido é cancelado aqui e no Bling.</DialogDescription></DialogHeader><div className="space-y-1"><Label>Motivo *</Label><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Mínimo de 5 caracteres" /></div><DialogFooter><Button variant="outline" onClick={onClose}>Voltar</Button><Button onClick={() => m.mutate()} disabled={motivo.trim().length < 5 || m.isPending}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar devolução</Button></DialogFooter></DialogContent></Dialog>;
}

export function FilaDevolucoes({ linhas }: { linhas: DevolucaoVD[] }) {
  const qc = useQueryClient(); const [acao, setAcao] = useState<{ d: DevolucaoVD; tipo: "aprovar" | "recusar" | "pix" } | null>(null); const [motivo, setMotivo] = useState(""); const [e2e, setE2e] = useState(""); const [obs, setObs] = useState("");
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES }), qc.invalidateQueries({ queryKey: QK_VD_GESTAO })]);
  const executarEstorno = async (id: string) => { const { data, error } = await supabase.functions.invoke("safrapay-estorno", { body: { devolucao_id: id } }); if (error) throw new Error((data as any)?.erro ?? error.message); if ((data as any)?.ok === false) throw new Error((data as any)?.erro); return data; };
  const decidir = useMutation({ mutationFn: async () => { if (!acao) return; const { error } = await supabase.rpc("vd_decidir_devolucao" as never, { p_devolucao_id: acao.d.id, p_aprovar: acao.tipo === "aprovar", p_motivo: motivo.trim() || null } as never); if (error) throw error; if (acao.tipo === "aprovar" && acao.d.meio === "cartao") await executarEstorno(acao.d.id); }, onSuccess: async () => { const atual = acao; toast.success(atual?.tipo === "recusar" ? "Devolução recusada" : "Devolução aprovada"); await atualizar(); if (atual?.tipo === "aprovar" && atual.d.meio === "pix") setAcao({ d: { ...atual.d, status: "aprovada" }, tipo: "pix" }); else setAcao(null); }, onError: (e) => toast.error(rawMessage(e)) });
  const concluirPix = useMutation({ mutationFn: async () => { if (!acao) return; const { error } = await supabase.rpc("vd_concluir_devolucao" as never, { p_devolucao_id: acao.d.id, p_prova_tipo: "pix_devolucao", p_prova_ref: e2e.trim(), p_obs: obs.trim() || null } as never); if (error) throw error; }, onSuccess: async () => { toast.success("Devolução PIX registrada"); setAcao(null); await atualizar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const tentar = useMutation({ mutationFn: (d: DevolucaoVD) => executarEstorno(d.id), onSuccess: async () => { toast.success("Estorno enviado"); await atualizar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const verificar = useMutation({ mutationFn: async (d: DevolucaoVD) => { const { data, error } = await supabase.functions.invoke("safrapay-link-sync", { body: { pedido_id: d.pedido_id } }); if (error) throw new Error((data as any)?.erro ?? error.message); if ((data as any)?.ok === false) throw new Error((data as any)?.erro); }, onSuccess: async () => { toast.success("Situação verificada"); await atualizar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const abrir = (d: DevolucaoVD, tipo: "aprovar" | "recusar" | "pix") => { setMotivo(""); setE2e(""); setObs(""); setAcao({ d, tipo }); };
  return <div className="overflow-hidden rounded-md border bg-card"><Table><TableHeader className="bg-muted"><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Meio</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Motivo</TableHead><TableHead>Solicitado por</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{linhas.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma devolução.</TableCell></TableRow> : linhas.map((d) => <TableRow key={d.id}><TableCell className="font-medium">{d.pedido?.id_externo ?? "—"}</TableCell><TableCell>{d.pedido?.cliente_nome_snapshot ?? "—"}</TableCell><TableCell>{d.meio === "pix" ? "PIX" : "Cartão"}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(d.valor)}</TableCell><TableCell className="max-w-48 whitespace-normal">{d.motivo_solicitacao}</TableCell><TableCell><div>{d.solicitante ?? "—"}</div><div className="text-xs text-muted-foreground">{dataHora(d.solicitado_em)}</div></TableCell><TableCell><Badge variant={d.status === "falhou" ? "destructive" : "outline"}>{ROTULO_DEVOLUCAO[d.status]}</Badge>{d.erro && <div className="mt-1 max-w-56 text-xs text-destructive">{d.erro}</div>}{d.status === "estorno_enviado" && <div className="mt-1 text-xs text-muted-foreground">Aguardando confirmação do Safra</div>}</TableCell><TableCell><div className="flex justify-end gap-1">{d.status === "solicitada" && <><Button size="sm" onClick={() => abrir(d, "aprovar")}><Check className="mr-1 h-4 w-4" />Aprovar</Button><Button size="sm" variant="outline" onClick={() => abrir(d, "recusar")}><X className="mr-1 h-4 w-4" />Recusar</Button></>}{d.status === "aprovada" && d.meio === "pix" && <Button size="sm" onClick={() => abrir(d, "pix")}>Registrar devolução PIX</Button>}{d.status === "falhou" && d.meio === "cartao" && <Button size="sm" variant="outline" onClick={() => tentar.mutate(d)}><RotateCcw className="mr-1 h-4 w-4" />Tentar estorno de novo</Button>}{d.status === "estorno_enviado" && <Button size="sm" variant="outline" onClick={() => verificar.mutate(d)}><RefreshCw className="mr-1 h-4 w-4" />Verificar agora</Button>}</div></TableCell></TableRow>)}</TableBody></Table>
  <Dialog open={!!acao} onOpenChange={(v) => !v && setAcao(null)}><DialogContent><DialogHeader><DialogTitle>{acao?.tipo === "pix" ? "Registrar devolução PIX" : acao?.tipo === "recusar" ? "Recusar devolução" : "Aprovar devolução"}</DialogTitle><DialogDescription>{acao?.d.pedido?.id_externo} · {formatBRL(acao?.d.valor)}{acao?.tipo === "pix" ? ` · E2E original: ${acao.d.prova_pagamento ?? "—"}` : ""}</DialogDescription></DialogHeader>{acao?.tipo === "pix" ? <div className="space-y-3"><div className="space-y-1"><Label>E2E da devolução *</Label><Input value={e2e} onChange={(e) => setE2e(e.target.value)} /></div><div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div></div> : <div className="space-y-1"><Label>{acao?.tipo === "recusar" ? "Motivo da recusa *" : "Observação"}</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>}<DialogFooter><Button variant="outline" onClick={() => setAcao(null)}>Voltar</Button><Button variant={acao?.tipo === "recusar" ? "destructive" : "default"} disabled={(acao?.tipo === "recusar" && motivo.trim().length < 3) || (acao?.tipo === "pix" && !e2e.trim()) || decidir.isPending || concluirPix.isPending} onClick={() => acao?.tipo === "pix" ? concluirPix.mutate() : decidir.mutate()}>{(decidir.isPending || concluirPix.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button></DialogFooter></DialogContent></Dialog></div>;
}

export function TrilhaDevolucao({ devolucao }: { devolucao: DevolucaoVD }) {
  return <div className="space-y-2 rounded-md border bg-card p-3 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{ROTULO_DEVOLUCAO[devolucao.status]}</span><span className="tabular-nums">{formatBRL(devolucao.valor)}</span></div><div><span className="text-muted-foreground">Solicitada:</span> {dataHora(devolucao.solicitado_em)} · {devolucao.solicitante ?? "—"}</div><div className="text-muted-foreground">{devolucao.motivo_solicitacao}</div>{devolucao.decidido_em && <div><span className="text-muted-foreground">Decidida:</span> {dataHora(devolucao.decidido_em)} · {devolucao.decisor ?? "—"}{devolucao.motivo_decisao ? ` · ${devolucao.motivo_decisao}` : ""}</div>}{devolucao.concluido_em && <div><span className="text-muted-foreground">Concluída:</span> {dataHora(devolucao.concluido_em)} · prova {devolucao.prova_tipo ?? "—"} · {devolucao.prova_ref ?? "—"}</div>}{devolucao.erro && <div className="text-destructive">{devolucao.erro}</div>}<div><span className="text-muted-foreground">Bling:</span> {devolucao.bling_status ?? "sem envio"}{devolucao.bling_erro ? ` · ${devolucao.bling_erro}` : ""}</div></div>;
}