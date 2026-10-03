import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Copy, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { Textarea } from "@/components/ui/textarea";
import {
  QK_VD_DEVOLUCOES,
  BotoesComprovante,
  ROTULO_DEVOLUCAO,
  TrilhaDevolucao,
  nomeCliente,
  type DevolucaoVD,
  type StatusDevolucao,
  useDevolucoesVD,
} from "@/components/venda-direta/DevolucaoVendaDireta";

type Filtro = StatusDevolucao | null;

const ETAPAS: { status: StatusDevolucao; rotulo: string; destaque?: "warning" | "destructive" }[] = [
  { status: "solicitada", rotulo: "Solicitada" },
  { status: "aprovada", rotulo: "Aprovada" },
  { status: "aguardando_devolucao", rotulo: "Aguardando devolução (PIX)", destaque: "warning" },
  { status: "estorno_enviado", rotulo: "Reembolso em curso", destaque: "warning" },
  { status: "concluida", rotulo: "Concluída" },
  { status: "recusada", rotulo: "Recusada" },
  { status: "falhou", rotulo: "Falhou", destaque: "destructive" },
];

const dataHora = (v: string | null) => v ? new Date(v).toLocaleString("pt-BR") : "—";

function LinhaCopiar({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return <div className="flex items-center justify-between gap-2 border-b py-1 last:border-0"><div className="min-w-0"><div className="text-xs text-muted-foreground">{rotulo}</div><div className="break-all tabular-nums">{valor || "—"}</div></div>{valor && <Button size="icon" variant="ghost" aria-label={`Copiar ${rotulo}`} onClick={async () => { try { await navigator.clipboard.writeText(valor); toast.success(`${rotulo} copiado`); } catch (e) { toast.error(rawMessage(e)); } }}><Copy className="h-4 w-4" /></Button>}</div>;
}

function DadosDevolucaoPix({ d }: { d: DevolucaoVD }) {
  const q = useQuery({
    queryKey: ["vd-devolucao-dados-pix", d.pedido_id],
    queryFn: async () => {
      const [prov, comp] = await Promise.all([
        supabase.from("provisao_recebimento" as never).select("prova_ref,pago_em").eq("pedido_id", d.pedido_id).not("pago_em", "is", null).order("pago_em", { ascending: false }).limit(1),
        supabase.from("comprovante_pagamento" as never).select("pagador_lido,payload_ia,data_lida").eq("pedido_id", d.pedido_id).limit(1),
      ]);
      if (prov.error) throw prov.error;
      if (comp.error) throw comp.error;
      const p = ((prov.data ?? []) as any[])[0]; const c = ((comp.data ?? []) as any[])[0];
      return { e2e: p?.prova_ref as string | null, pagoEm: (p?.pago_em ?? c?.data_lida) as string | null, pagador: c?.pagador_lido as string | null, documento: c?.payload_ia?.pagador_documento as string | null, instituicao: c?.payload_ia?.instituicao as string | null };
    },
  });
  useEffect(() => { if (q.error) toast.error(rawMessage(q.error)); }, [q.error]);
  const v = q.data;
  return <div className="rounded-md border border-warning/50 bg-card p-3 text-sm"><div className="font-medium">Dados para a devolução</div><p className="mb-2 text-xs text-muted-foreground">Devolver pelo app do banco: PIX recebidos → este pagamento → Devolver.</p>{q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.isError ? <div className="text-destructive">{rawMessage(q.error)}</div> : <>
    <LinhaCopiar rotulo="Valor" valor={Number(d.valor).toFixed(2).replace(".", ",")} />
    <LinhaCopiar rotulo="E2E do pagamento original" valor={v?.e2e} />
    <LinhaCopiar rotulo="Pagador" valor={v?.pagador} />
    <LinhaCopiar rotulo="Documento do pagador" valor={v?.documento} />
    <LinhaCopiar rotulo="Instituição" valor={v?.instituicao} />
    <LinhaCopiar rotulo="Data do pagamento" valor={v?.pagoEm ? dataHora(v.pagoEm) : null} />
  </>}</div>;
}

function CardEtapa({ rotulo, total, ativo, destaque, aoClicar }: {
  rotulo: string; total: number; ativo: boolean; destaque?: "warning" | "destructive"; aoClicar: () => void;
}) {
  return (
    <Card role="button" tabIndex={0} onClick={aoClicar} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && aoClicar()}
      className={cn("cursor-pointer bg-card transition-colors hover:bg-muted/50", ativo && "ring-2 ring-primary", total > 0 && destaque === "warning" && "border-warning bg-warning/10", total > 0 && destaque === "destructive" && "border-destructive bg-destructive/10")}>
      <CardContent className="p-3">
        <div className={cn("text-xs text-muted-foreground", total > 0 && destaque === "warning" && "text-warning", total > 0 && destaque === "destructive" && "text-destructive")}>{rotulo}</div>
        <div className={cn("text-2xl font-medium tabular-nums", total > 0 && destaque === "warning" && "text-warning", total > 0 && destaque === "destructive" && "text-destructive")}>{total}</div>
      </CardContent>
    </Card>
  );
}

export function CancelamentoReembolsoPainel() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const pedidoParam = params.get("pedido");
  const q = useDevolucoesVD();
  const { permitido } = usePermissaoAcao("acao.vd_devolucao_aprovar");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ d: DevolucaoVD; tipo: "aprovar" | "recusar" | "pix" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [e2e, setE2e] = useState("");
  const [obs, setObs] = useState("");
  const [anexo, setAnexo] = useState<{ path: string; valor: number | null } | null>(null);
  const [lendo, setLendo] = useState(false);

  useEffect(() => { if (q.error) toast.error(rawMessage(q.error)); }, [q.error]);
  useEffect(() => {
    if (!pedidoParam || !q.data) return;
    const alvo = q.data.find((d) => d.pedido_id === pedidoParam);
    if (alvo) setExpandido(alvo.id);
  }, [pedidoParam, q.data]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? []).filter((d) => {
      if (pedidoParam && d.pedido_id !== pedidoParam) return false;
      if (filtro && d.status !== filtro) return false;
      if (!termo) return true;
      return d.pedido?.id_externo?.toLowerCase().includes(termo) || nomeCliente(d.pedido)?.toLowerCase().includes(termo) || d.motivo_solicitacao.toLowerCase().includes(termo);
    });
  }, [busca, filtro, pedidoParam, q.data]);

  const atualizar = () => qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES });
  const estornar = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("safrapay-estorno", { body: { devolucao_id: id } });
    if (error) throw new Error((data as { erro?: string } | null)?.erro ?? error.message);
    if ((data as { ok?: boolean; erro?: string } | null)?.ok === false) throw new Error((data as { erro?: string }).erro);
    return data as { status?: string };
  };
  const decidir = useMutation({
    mutationFn: async () => {
      if (!acao) return null;
      const { error } = await supabase.rpc("vd_decidir_devolucao" as never, { p_devolucao_id: acao.d.id, p_aprovar: acao.tipo === "aprovar", p_motivo: motivo.trim() || null } as never);
      if (error) throw error;
      return acao.tipo === "aprovar" && acao.d.meio === "cartao" ? estornar(acao.d.id) : null;
    },
    onSuccess: async (resultado) => {
      const atual = acao;
      toast.success(atual?.tipo === "recusar" ? "Cancelamento sem NF recusado" : atual?.d.meio === "pix" ? "Aprovado — aguardando a devolução PIX pelo financeiro" : resultado?.status === "concluida" ? "Reembolso concluído" : resultado?.status === "estorno_enviado" ? "Reembolso enviado; aguardando confirmação do Safra" : "Cancelamento sem NF aprovado");
      await atualizar();
      setAcao(null);
    },
    onError: async (e) => { toast.error(rawMessage(e)); await atualizar(); },
  });
  const enviarAnexo = async (file: File | undefined) => {
    if (!file || !acao) return;
    setLendo(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `devolucao/${acao.d.pedido_id}/${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from("comprovantes-pagamento").upload(path, file, { contentType: file.type || undefined, upsert: true });
      if (up) throw up;
      const { data: lido, error: fe } = await supabase.functions.invoke("ler-comprovante-pagamento", { body: { storage_path: path } });
      const l = lido as { chave?: string; valor?: number; error?: string } | null;
      if (fe || l?.error) throw new Error(l?.error ?? fe?.message ?? "Falha ao ler o comprovante");
      setAnexo({ path, valor: typeof l?.valor === "number" ? l.valor : null });
      if (l?.chave) setE2e(l.chave);
      toast.success("Comprovante lido pela IA — revise o identificador.");
    } catch (e) { setAnexo(null); toast.error(rawMessage(e)); } finally { setLendo(false); }
  };
  const valorDiverge = !!anexo && anexo.valor != null && !!acao && Math.abs(anexo.valor - Number(acao.d.valor)) > 0.009;
  const concluirPix = useMutation({
    mutationFn: async () => {
      if (!acao) return;
      const { error } = await supabase.rpc("vd_concluir_devolucao" as never, { p_devolucao_id: acao.d.id, p_prova_tipo: "pix_devolucao", p_prova_ref: e2e.trim(), p_obs: [obs.trim(), anexo ? `anexo: ${anexo.path}` : ""].filter(Boolean).join(" · ") || null } as never);
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Devolução PIX registrada"); setAcao(null); await atualizar(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  const tentar = useMutation({
    mutationFn: (d: DevolucaoVD) => estornar(d.id),
    onSuccess: async (resultado) => { toast.success(resultado?.status === "concluida" ? "Reembolso concluído" : "Reembolso enviado; aguardando confirmação do Safra"); await atualizar(); },
    onError: async (e) => { toast.error(rawMessage(e)); await atualizar(); },
  });
  const verificar = useMutation({
    mutationFn: async (d: DevolucaoVD) => {
      const { data, error } = await supabase.functions.invoke("safrapay-link-sync", { body: { pedido_id: d.pedido_id } });
      if (error) throw new Error((data as { erro?: string } | null)?.erro ?? error.message);
      if ((data as { ok?: boolean; erro?: string } | null)?.ok === false) throw new Error((data as { erro?: string }).erro);
    },
    onSuccess: async () => { toast.success("Situação verificada"); await atualizar(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  const abrirAcao = (d: DevolucaoVD, tipo: "aprovar" | "recusar" | "pix") => { setMotivo(""); setE2e(""); setObs(""); setAnexo(null); setAcao({ d, tipo }); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 xl:flex-row">
        <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-5">
          {ETAPAS.slice(0, 5).map((e) => <CardEtapa key={e.status} rotulo={e.rotulo} total={(q.data ?? []).filter((d) => d.status === e.status).length} ativo={filtro === e.status} destaque={e.destaque} aoClicar={() => setFiltro(filtro === e.status ? null : e.status)} />)}
        </div>
        <div className="grid grid-cols-2 gap-2 xl:w-1/3">
          {ETAPAS.slice(5).map((e) => <CardEtapa key={e.status} rotulo={e.rotulo} total={(q.data ?? []).filter((d) => d.status === e.status).length} ativo={filtro === e.status} destaque={e.destaque} aoClicar={() => setFiltro(filtro === e.status ? null : e.status)} />)}
        </div>
      </div>
      <TabelaFetely busca={{ valor: busca, aoMudar: setBusca, placeholder: "Pedido, cliente ou motivo" }} carregando={q.isLoading} erro={q.isError ? rawMessage(q.error) : null} aoTentarNovamente={() => q.refetch()} vazio={{ mensagem: "Nenhum cancelamento sem NF." }} semResultado="Nenhum cancelamento para esse filtro." total={(q.data ?? []).length} exibidos={linhas.length} rotulo="cancelamentos sem NF">
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead className="w-8" /><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Meio</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Motivo</TableHead><TableHead>Solicitado por/em</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{linhas.map((d) => {
              const aberto = expandido === d.id;
              return <Fragment key={d.id}>
                <TableRow className="cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input")) return; setExpandido(aberto ? null : d.id); }}>
                  <TableCell>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell><div className="font-medium">{d.pedido?.id_externo ?? "—"}</div><div className="text-xs text-muted-foreground">Site SP</div></TableCell>
                  <TableCell>{nomeCliente(d.pedido) ?? "—"}</TableCell><TableCell>{d.meio === "pix" ? "PIX" : "Cartão"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(d.valor)}</TableCell><TableCell className="max-w-48 whitespace-normal">{d.motivo_solicitacao}</TableCell>
                  <TableCell><div>{d.solicitante ?? "—"}</div><div className="text-xs text-muted-foreground">{dataHora(d.solicitado_em)}</div></TableCell>
                  <TableCell><Badge variant={d.status === "falhou" ? "destructive" : "outline"}>{d.status === "estorno_enviado" ? "Reembolso em curso" : ROTULO_DEVOLUCAO[d.status]}</Badge>{d.erro && <div className="mt-1 max-w-56 text-xs text-destructive">{d.erro}</div>}{d.status === "estorno_enviado" && <div className="mt-1 text-xs text-muted-foreground">Aguardando confirmação do Safra</div>}</TableCell>
                  <TableCell><div className="flex justify-end gap-1">{permitido && d.status === "solicitada" && <><Button size="sm" onClick={() => abrirAcao(d, "aprovar")}><Check className="mr-1 h-4 w-4" />Aprovar</Button><Button size="sm" variant="outline" onClick={() => abrirAcao(d, "recusar")}><X className="mr-1 h-4 w-4" />Recusar</Button></>}{permitido && d.status === "aguardando_devolucao" && <Button size="sm" onClick={() => abrirAcao(d, "pix")}>Registrar devolução</Button>}{d.status === "concluida" && <span className="text-xs font-medium text-primary">Próximo: enviar comprovante ao cliente</span>}{permitido && d.status === "falhou" && d.meio === "cartao" && <Button size="sm" variant="outline" onClick={() => tentar.mutate(d)}><RotateCcw className="mr-1 h-4 w-4" />Tentar estorno de novo</Button>}{permitido && d.status === "estorno_enviado" && <Button size="sm" variant="outline" onClick={() => verificar.mutate(d)}><RefreshCw className="mr-1 h-4 w-4" />Verificar agora</Button>}</div></TableCell>
                </TableRow>
                {aberto && <TableRow className="bg-muted/30 hover:bg-muted/30"><TableCell colSpan={9}><div className="space-y-3 p-2">{d.status === "aguardando_devolucao" && <DadosDevolucaoPix d={d} />}{d.status === "concluida" && <div className="rounded-md border border-primary/40 bg-card p-3"><div className="text-sm font-medium">Próximo passo: enviar comprovante ao cliente</div><BotoesComprovante devolucao={d} /></div>}<TrilhaDevolucao devolucao={d} mostrarLinkEsteira={false} /></div></TableCell></TableRow>}
              </Fragment>;
            })}</TableBody>
          </Table>
        </div>
      </TabelaFetely>
      <Dialog open={!!acao} onOpenChange={(v) => !v && setAcao(null)}><DialogContent><DialogHeader><DialogTitle>{acao?.tipo === "pix" ? "Registrar devolução PIX" : acao?.tipo === "recusar" ? "Recusar cancelamento com reembolso" : "Aprovar cancelamento com reembolso"}</DialogTitle><DialogDescription>{acao?.d.pedido?.id_externo} · {formatBRL(acao?.d.valor)}{acao?.tipo === "pix" ? ` · E2E original: ${acao.d.prova_pagamento ?? "—"}` : ""}</DialogDescription></DialogHeader>{acao?.tipo === "pix" ? <div className="space-y-3"><div className="space-y-1"><Label>Comprovante da devolução (PDF/imagem) *</Label><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={lendo} onChange={(e) => void enviarAnexo(e.target.files?.[0])} />{lendo && <p className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Lendo comprovante…</p>}{anexo && <p className="text-xs text-muted-foreground">Anexado · valor lido {anexo.valor != null ? formatBRL(anexo.valor) : "—"}</p>}{valorDiverge && <p className="text-xs text-warning">Valor lido ({formatBRL(anexo?.valor)}) diferente da devolução ({formatBRL(acao?.d.valor)}). Explique na observação.</p>}</div><div className="space-y-1"><Label>E2E / ID da devolução *</Label><Input value={e2e} onChange={(e) => setE2e(e.target.value)} /></div><div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div></div> : <div className="space-y-1"><Label>{acao?.tipo === "recusar" ? "Motivo da recusa *" : "Observação"}</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>}<DialogFooter><Button variant="outline" onClick={() => setAcao(null)}>Voltar</Button><Button variant={acao?.tipo === "recusar" ? "destructive" : "default"} disabled={(acao?.tipo === "recusar" && motivo.trim().length < 5) || (acao?.tipo === "pix" && (!e2e.trim() || !anexo || lendo || (valorDiverge && obs.trim().length < 5))) || decidir.isPending || concluirPix.isPending} onClick={() => acao?.tipo === "pix" ? concluirPix.mutate() : decidir.mutate()}>{(decidir.isPending || concluirPix.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}