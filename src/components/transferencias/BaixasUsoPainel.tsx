import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError, rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { useEstadoTela } from "@/lib/navegacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BotaoVerificarBling } from "@/components/bling/BotaoVerificarBling";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface BaixaUso {
  id: string; codigo: string; status: string; criado_em: string; origem_rotulo: string | null;
  finalidade: string; finalidade_rotulo: string | null; evento_nome: string | null;
  pecas: number | null; valor_custo: number | null; situacao_fiscal: string | null;
  nf_saida_numero: string | null; nf_saida_erro: string | null;
  situacao_fiscal_retorno: string | null; nf_retorno_numero: string | null; nf_retorno_erro: string | null;
  pecas_baixadas: number | null; situacao_fiscal_baixa: string | null; nf_baixa_numero: string | null; nf_baixa_erro: string | null;
  nf_saida_bling_id?: string | number | null; nf_retorno_bling_id?: string | number | null; nf_baixa_bling_id?: string | number | null;
}
interface ItemBaixa { sku: string; quantidade: number; quantidade_retornada: number | null }

export function useBaixasUso() {
  const q = useQuery({
    queryKey: ["baixa-uso", "lista"],
    queryFn: async (): Promise<BaixaUso[]> => {
      const { data, error } = await supabase
        .from("vw_baixa_uso")
        .select("id, codigo, status, criado_em, origem_rotulo, finalidade, finalidade_rotulo, evento_nome, pecas, valor_custo, situacao_fiscal, nf_saida_numero, nf_saida_erro, situacao_fiscal_retorno, nf_retorno_numero, nf_retorno_erro, pecas_baixadas, situacao_fiscal_baixa, nf_baixa_numero, nf_baixa_erro")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((r: any) => r.id);
      const blingPorId = new Map<string, any>();
      if (ids.length) {
        const { data: bl, error: eBl } = await supabase.from("baixa_uso").select("id, nf_saida_bling_id, nf_retorno_bling_id, nf_baixa_bling_id").in("id", ids);
        if (eBl) throw eBl;
        for (const r of bl ?? []) blingPorId.set((r as any).id, r);
      }
      return (data ?? []).map((r: any) => ({ ...r, ...(blingPorId.get(r.id) ?? {}) })) as BaixaUso[];
    },
  });
  useEffect(() => {
    if (q.isError) toast.error(formatError(q.error));
  }, [q.isError, q.error]);
  return q;
}

const STATUS: Record<string, { rotulo: string; cls: string }> = {
  efetivada: { rotulo: "Efetivada", cls: "bg-success/15 text-success border-success/30" },
  em_evento: { rotulo: "Em evento", cls: "bg-warning/15 text-warning border-warning/40" },
  encerrada: { rotulo: "Encerrada", cls: "bg-muted text-muted-foreground" },
  cancelada: { rotulo: "Cancelada", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

async function carregarItens(id: string): Promise<ItemBaixa[]> {
  const { data, error } = await supabase
    .from("baixa_uso_item")
    .select("sku, quantidade, quantidade_retornada")
    .eq("baixa_id", id)
    .order("sku");
  if (error) throw error;
  return (data ?? []).map((r) => ({ sku: r.sku, quantidade: Number(r.quantidade), quantidade_retornada: r.quantidade_retornada == null ? null : Number(r.quantidade_retornada) }));
}

function ItensBaixa({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["baixa-uso", "itens", id], queryFn: () => carregarItens(id) });
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (q.isError) return <p className="text-sm text-destructive">{formatError(q.error)}</p>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead className="text-right">Retornada</TableHead></TableRow></TableHeader>
      <TableBody>
        {(q.data ?? []).map((i) => (
          <TableRow key={i.sku}>
            <TableCell className="font-mono">{i.sku}</TableCell>
            <TableCell className="text-right tabular-nums">{i.quantidade.toLocaleString("pt-BR")}</TableCell>
            <TableCell className="text-right tabular-nums">{(i.quantidade_retornada ?? 0).toLocaleString("pt-BR")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DialogoEncerrar({ baixa, onClose }: { baixa: BaixaUso; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["baixa-uso", "itens", baixa.id], queryFn: () => carregarItens(baixa.id) });
  const [voltou, setVoltou] = useState<Record<string, number>>({});
  useEffect(() => {
    if (q.data) setVoltou(Object.fromEntries(q.data.map((i) => [i.sku, i.quantidade])));
  }, [q.data]);
  const voltam = (q.data ?? []).reduce((s, i) => s + (voltou[i.sku] ?? 0), 0);
  const baixadas = (q.data ?? []).reduce((s, i) => s + i.quantidade - (voltou[i.sku] ?? 0), 0);
  const invalido = (q.data ?? []).some((i) => { const v = voltou[i.sku]; return !Number.isFinite(v) || v < 0 || v > i.quantidade; });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("fn_baixa_uso_encerrar", {
        p_baixa_id: baixa.id,
        p_retornos: (q.data ?? []).map((i) => ({ sku: i.sku, retornado: voltou[i.sku] ?? 0 })),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      const nfs = [voltam > 0 && "de retorno", baixadas > 0 && "de baixa"].filter(Boolean);
      toast.success(nfs.length === 2 ? "Evento encerrado. Gere as NFs de retorno e de baixa na lista." : nfs.length === 1 ? `Evento encerrado. Gere a NF ${nfs[0]} na lista.` : `Evento ${baixa.codigo} encerrado.`); await qc.invalidateQueries({ queryKey: ["baixa-uso"] }); onClose(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Encerrar evento · {baixa.codigo}{baixa.evento_nome ? ` · ${baixa.evento_nome}` : ""}</DialogTitle></DialogHeader>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.isError ? <p className="text-sm text-destructive">{formatError(q.error)}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead className="text-right">Enviado</TableHead><TableHead className="w-28">Voltou</TableHead><TableHead className="text-right">Baixado</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((i) => {
                const v = voltou[i.sku] ?? 0;
                return (
                  <TableRow key={i.sku}>
                    <TableCell className="font-mono">{i.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                    <TableCell><Input type="number" min={0} max={i.quantidade} value={v} onChange={(e) => setVoltou((s) => ({ ...s, [i.sku]: Number(e.target.value) }))} className={v < 0 || v > i.quantidade ? "border-destructive" : ""} /></TableCell>
                    <TableCell className="text-right tabular-nums">{i.quantidade - v}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">Baixado = enviado − voltou.</p>
        {q.data && !invalido && (
          <p className="text-sm">Voltam {voltam.toLocaleString("pt-BR")} peças (NF de retorno) · Baixa de {baixadas.toLocaleString("pt-BR")} peças por consumo interno (NF de baixa)</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Voltar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !q.data || invalido}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Encerrar evento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelar({ baixa, onClose }: { baixa: BaixaUso; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("fn_baixa_uso_cancelar", { p_baixa_id: baixa.id, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(`Baixa ${baixa.codigo} cancelada.`); await qc.invalidateQueries({ queryKey: ["baixa-uso"] }); onClose(); },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancelar baixa {baixa.codigo}</DialogTitle></DialogHeader>
        <label className="text-sm font-medium">Motivo *</label>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Voltar</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending || !motivo.trim()}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancelar baixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function gerarNf(baixaId: string, qual: "saida" | "retorno" | "baixa") {
  const { data, error } = await supabase.functions.invoke("baixa-uso-gerar-rascunho", { body: { baixa_id: baixaId, qual } });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const corpo = await resposta.clone().json().catch(() => null) as { erro?: string } | null;
      if (corpo?.erro) throw new Error(corpo.erro);
    }
    throw error;
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha ao gerar a NF.");
  return data as { numero: string | null; recuperado?: boolean };
}

function CelulaFiscal({ b }: { b: BaixaUso }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => gerarNf(b.id, "saida"),
    onSuccess: (r) => toast.success(r.recuperado ? `Rascunho ${r.numero} já existia no Bling e foi ligado à ${b.codigo}.` : `Rascunho ${r.numero ?? ""} criado no Bling para ${b.codigo}.`),
    onError: (e) => toast.error(rawMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["baixa-uso"] }),
  });
  const s = b.situacao_fiscal;
  if (m.isPending || s === "gerando") return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gerando…</span>;
  if (s === "pendente_definicao_fiscal") return <Badge variant="outline" className="bg-muted text-muted-foreground">NF aguardando definição fiscal</Badge>;
  if (s === "a_gerar") return <Button size="sm" variant="outline" onClick={() => m.mutate()}>Gerar NF</Button>;
  if (s === "rascunho") return <span className="inline-flex items-center gap-1"><Badge variant="outline" className="bg-warning/15 text-warning border-warning/40">Rascunho {b.nf_saida_numero} — Eva transmite no Bling</Badge><BotaoVerificarBling blingId={b.nf_saida_bling_id} /></span>;
  if (s === "autorizada") return <Badge variant="outline" className="bg-success/15 text-success border-success/30">NF {b.nf_saida_numero}</Badge>;
  if (s === "erro") return (
    <div className="flex items-center gap-2">
      <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="cursor-help bg-destructive/10 text-destructive border-destructive/30">Erro na NF</Badge></TooltipTrigger><TooltipContent className="max-w-sm whitespace-pre-wrap">{b.nf_saida_erro ?? "Erro sem mensagem"}</TooltipContent></Tooltip>
      <Button size="sm" variant="outline" onClick={() => m.mutate()}>Tentar de novo</Button>
    </div>
  );
  return <span>{s ?? "—"}</span>;
}

function CelulaFiscalRetorno({ b }: { b: BaixaUso }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => gerarNf(b.id, "retorno"),
    onSuccess: (r) => toast.success(r.recuperado ? `Rascunho de retorno ${r.numero} já existia no Bling e foi ligado à ${b.codigo}.` : `Rascunho de retorno ${r.numero ?? ""} criado no Bling para ${b.codigo}.`),
    onError: (e) => toast.error(rawMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["baixa-uso"] }),
  });
  const s = b.situacao_fiscal_retorno;
  if (!s) return null;
  if (m.isPending || s === "gerando") return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gerando retorno…</span>;
  if (s === "aguardando_remessa") return <Badge variant="outline" className="bg-muted text-muted-foreground">Retorno aguarda NF de remessa autorizada</Badge>;
  if (s === "pendente_definicao_fiscal") return <Badge variant="outline" className="bg-muted text-muted-foreground">Retorno aguardando definição fiscal</Badge>;
  if (s === "a_gerar") return <Button size="sm" variant="outline" onClick={() => m.mutate()}>Gerar NF de retorno</Button>;
  if (s === "rascunho") return <span className="inline-flex items-center gap-1"><Badge variant="outline" className="bg-warning/15 text-warning border-warning/40">Retorno {b.nf_retorno_numero} — Eva transmite</Badge><BotaoVerificarBling blingId={b.nf_retorno_bling_id} /></span>;
  if (s === "autorizada") return <Badge variant="outline" className="bg-success/15 text-success border-success/30">Retorno {b.nf_retorno_numero}</Badge>;
  if (s === "erro") return (
    <div className="flex items-center gap-2">
      <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="cursor-help bg-destructive/10 text-destructive border-destructive/30">Erro na NF de retorno</Badge></TooltipTrigger><TooltipContent className="max-w-sm whitespace-pre-wrap">{b.nf_retorno_erro ?? "Erro sem mensagem"}</TooltipContent></Tooltip>
      <Button size="sm" variant="outline" onClick={() => m.mutate()}>Tentar de novo</Button>
    </div>
  );
  return <span>{s}</span>;
}

function CelulaFiscalBaixa({ b }: { b: BaixaUso }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => gerarNf(b.id, "baixa"),
    onSuccess: (r) => toast.success(r.recuperado ? `Rascunho de baixa ${r.numero} já existia no Bling e foi ligado à ${b.codigo}.` : `Rascunho de baixa ${r.numero ?? ""} criado no Bling para ${b.codigo}.`),
    onError: (e) => toast.error(rawMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["baixa-uso"] }),
  });
  const s = b.situacao_fiscal_baixa;
  if (!s) return null;
  if (m.isPending || s === "gerando") return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gerando baixa…</span>;
  if (s === "aguardando_remessa") return <Badge variant="outline" className="bg-muted text-muted-foreground">Baixa da diferença aguarda NF de remessa</Badge>;
  if (s === "pendente_definicao_fiscal") return <Badge variant="outline" className="bg-muted text-muted-foreground">Baixa da diferença aguardando definição fiscal</Badge>;
  if (s === "a_gerar") return <Button size="sm" variant="outline" onClick={() => m.mutate()}>Gerar NF de baixa da diferença ({Number(b.pecas_baixadas ?? 0).toLocaleString("pt-BR")} pç)</Button>;
  if (s === "rascunho") return <span className="inline-flex items-center gap-1"><Badge variant="outline" className="bg-warning/15 text-warning border-warning/40">Baixa {b.nf_baixa_numero} — Eva transmite</Badge><BotaoVerificarBling blingId={b.nf_baixa_bling_id} /></span>;
  if (s === "autorizada") return <Badge variant="outline" className="bg-success/15 text-success border-success/30">Baixa {b.nf_baixa_numero}</Badge>;
  if (s === "erro") return (
    <div className="flex items-center gap-2">
      <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="cursor-help bg-destructive/10 text-destructive border-destructive/30">Erro na NF de baixa</Badge></TooltipTrigger><TooltipContent className="max-w-sm whitespace-pre-wrap">{b.nf_baixa_erro ?? "Erro sem mensagem"}</TooltipContent></Tooltip>
      <Button size="sm" variant="outline" onClick={() => m.mutate()}>Tentar de novo</Button>
    </div>
  );
  return <span>{s}</span>;
}

export function BaixasUsoPainel() {
  const q = useBaixasUso();
  const [nav, setNav] = useEstadoTela({ status: "todos", finalidade: "todas" }, { prefixo: "bu" });
  const [aberta, setAberta] = useState<string | null>(null);
  const [encerrar, setEncerrar] = useState<BaixaUso | null>(null);
  const [cancelar, setCancelar] = useState<BaixaUso | null>(null);
  const linhas = q.data ?? [];
  const finalidades = Array.from(new Map(linhas.map((l) => [l.finalidade, l.finalidade_rotulo ?? l.finalidade])));
  const visiveis = linhas.filter((l) => (nav.status === "todos" || l.status === nav.status) && (nav.finalidade === "todas" || l.finalidade === nav.finalidade));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap gap-3">
          <Select value={nav.status} onValueChange={(v) => setNav({ status: v })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={nav.finalidade} onValueChange={(v) => setNav({ finalidade: v })}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as finalidades</SelectItem>
              {finalidades.map(([k, r]) => <SelectItem key={k} value={k}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : q.isError ? <p className="text-sm text-destructive">{formatError(q.error)}</p> : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma baixa para uso.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" /><TableHead>Código</TableHead><TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Finalidade</TableHead>
                <TableHead className="text-right">Peças</TableHead><TableHead className="text-right">Valor a custo</TableHead><TableHead>Status</TableHead><TableHead>Fiscal</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((b) => {
                const st = STATUS[b.status] ?? { rotulo: b.status, cls: "" };
                const exp = aberta === b.id;
                return (
                  <Fragment key={b.id}>
                    <TableRow data-foco-id={b.id} className="cursor-pointer" onClick={() => setAberta(exp ? null : b.id)}>
                      <TableCell>{exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-mono font-medium">{b.codigo}</TableCell>
                      <TableCell>{new Date(b.criado_em).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{b.origem_rotulo ?? "—"}</TableCell>
                      <TableCell>{b.finalidade_rotulo ?? b.finalidade}{b.evento_nome && <span className="block text-xs text-muted-foreground">{b.evento_nome}</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(b.pecas ?? 0).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(b.valor_custo)}</TableCell>
                      <TableCell><Badge variant="outline" className={st.cls}>{st.rotulo}</Badge></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}><div className="flex flex-col items-start gap-1"><CelulaFiscal b={b} /><CelulaFiscalRetorno b={b} /><CelulaFiscalBaixa b={b} /></div></TableCell>
                      <TableCell className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        {b.status === "em_evento" && <Button size="sm" variant="outline" className="mr-2" onClick={() => setEncerrar(b)}>Encerrar evento</Button>}
                        {(b.status === "efetivada" || b.status === "em_evento") && (b.situacao_fiscal === "rascunho" || b.situacao_fiscal === "autorizada" ? (
                          <Tooltip><TooltipTrigger asChild><span tabIndex={0}><Button size="sm" variant="ghost" className="text-destructive" disabled>Cancelar</Button></span></TooltipTrigger><TooltipContent>Já tem NF no Bling — exclua/cancele lá antes</TooltipContent></Tooltip>
                        ) : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelar(b)}>Cancelar</Button>)}
                      </TableCell>
                    </TableRow>
                    {exp && <TableRow><TableCell colSpan={10} className="bg-muted/30"><ItensBaixa id={b.id} /></TableCell></TableRow>}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {encerrar && <DialogoEncerrar baixa={encerrar} onClose={() => setEncerrar(null)} />}
      {cancelar && <DialogoCancelar baixa={cancelar} onClose={() => setCancelar(null)} />}
    </Card>
  );
}
