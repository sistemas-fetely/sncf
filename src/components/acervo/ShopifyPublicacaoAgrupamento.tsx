import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { agrupamentoKey, type HistoricoAgrupamento } from "./useAgrupamentoShopify";
import { podePublicarAgrupamento, type ResultadoPublicacao } from "./agrupamentoShopify";

async function invocar(id: string, dry_run: boolean): Promise<ResultadoPublicacao> {
  const { data, error } = await supabase.functions.invoke("shopify-publicar-agrupamento", { body: { agrupamento_id: id, dry_run } });
  if (error) {
    let mensagem = formatError(error);
    try {
      const corpo = await (error as { context?: Response }).context?.json();
      if (corpo?.erro) mensagem = corpo.erro;
    } catch { /* preserva erro original */ }
    throw new Error(mensagem);
  }
  if (!data) throw new Error("Resposta vazia da publicação.");
  return data as ResultadoPublicacao;
}

export function ShopifyPublicacaoAgrupamento({ pai, permitido, alterado }: { pai: HistoricoAgrupamento; permitido: boolean; alterado: boolean }) {
  const qc = useQueryClient();
  const [simulacao, setSimulacao] = useState<ResultadoPublicacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoPublicacao | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const chamada = useMutation({ mutationFn: (dry: boolean) => invocar(pai.id, dry) });
  const habilitado = podePublicarAgrupamento(simulacao, permitido, alterado, chamada.isPending);
  async function simular() {
    setSimulacao(null); setResultado(null);
    try {
      const r = await chamada.mutateAsync(true); setSimulacao(r);
      if (!r.ok && r.erro) toast.error(r.erro);
    } catch (e) { toast.error(formatError(e)); }
  }
  async function publicar() {
    if (!habilitado) return;
    try {
      const r = await chamada.mutateAsync(false); setResultado(r); setSimulacao(null); setConfirmar(false);
      if (r.status === "sucesso") toast.success("Publicado no Shopify (rascunho)");
      else if (r.status === "parcial") toast.warning("Publicação parcial no Shopify — confira os avisos e produtos não removidos.");
      else if (!r.ok) toast.error(r.erro ?? "Publicação não concluída.");
    } catch (e) { toast.error(formatError(e)); }
    finally { await qc.invalidateQueries({ queryKey: agrupamentoKey }); }
  }
  return <article className="rounded-md border bg-card card-shadow p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium break-words">{pai.titulo}</h4><Badge variant="outline" className={pai.status === "publicado" ? "text-success border-success/40" : "text-warning border-warning/40"}>{pai.status === "publicado" ? "Publicado" : pai.status === "rascunho" ? "Rascunho" : pai.status}</Badge></div>
    <p className="text-sm text-muted-foreground">{pai.skus} SKUs</p>
    {pai.status === "publicado" && <p className="text-xs text-muted-foreground break-all">{pai.id_externo ?? "—"}</p>}
    {pai.status === "rascunho" && <>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={alterado || chamada.isPending || !permitido} onClick={() => void simular()}><Eye className="mr-2 h-4 w-4" />Simular publicação</Button><Button disabled={!habilitado} onClick={() => setConfirmar(true)}><Send className="mr-2 h-4 w-4" />Publicar no Shopify</Button></div>
      {chamada.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando Shopify…</p>}
      {chamada.isError && <Alert variant="destructive"><AlertDescription>{formatError(chamada.error)}</AlertDescription></Alert>}
      {simulacao?.bloqueado && <Alert variant="destructive"><AlertDescription><p>{simulacao.erro}</p><ul className="mt-2 list-disc pl-4 space-y-1">{simulacao.bloqueios?.map((b, i) => <li key={i}>{b.erro}{b.produto && <span className="block">{b.produto.titulo} · {b.produto.status}</span>}</li>)}</ul></AlertDescription></Alert>}
      {simulacao?.ok && <div className="space-y-3"><p className="text-sm font-medium">{simulacao.variantes} variantes</p>{simulacao.opcoes?.map((o) => <div key={o.name} className="space-y-1"><p className="text-xs text-muted-foreground">{o.name}</p><div className="flex flex-wrap gap-1">{o.values.map((v) => <Badge key={v.name} variant="secondary">{v.name}</Badge>)}</div></div>)}<h5 className="text-sm font-medium">Será removido do Shopify</h5>{simulacao.remover?.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>SKUs</TableHead></TableRow></TableHeader><TableBody>{simulacao.remover.map((r, i) => <TableRow key={r.id ?? i}><TableCell>{r.titulo}</TableCell><TableCell>{r.status}</TableCell><TableCell className="break-all">{r.skus.join(", ")}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="text-sm text-muted-foreground">Nenhum produto solto a remover.</p>}</div>}
      {simulacao && !simulacao.ok && !simulacao.bloqueado && simulacao.erro && <Alert variant="destructive"><AlertDescription>{simulacao.erro}</AlertDescription></Alert>}
    </>}
    {resultado && <div className="space-y-2">{resultado.erro && <Alert variant="destructive"><AlertDescription>{resultado.erro}</AlertDescription></Alert>}{resultado.nao_removidos?.map((r, i) => <Alert variant="destructive" key={r.id ?? i}><AlertDescription>Não removido: {r.titulo} · {r.status} · {r.erro}</AlertDescription></Alert>)}{resultado.avisos?.map((a, i) => <Alert key={i}><AlertDescription>{a}</AlertDescription></Alert>)}</div>}
    <AlertDialog open={confirmar} onOpenChange={(v) => { if (!chamada.isPending) setConfirmar(v); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Publicar no Shopify?</AlertDialogTitle><AlertDialogDescription>Vai criar 1 produto em Rascunho com {simulacao?.variantes} variantes e remover {simulacao?.remover?.length ?? 0} produto(s) solto(s) em rascunho no Shopify. Continuar?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={chamada.isPending}>Cancelar</AlertDialogCancel><Button disabled={!habilitado} onClick={() => void publicar()}>Publicar no Shopify</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </article>;
}