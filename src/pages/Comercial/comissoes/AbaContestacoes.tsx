import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtBRL, fmtData } from "./fmt";

interface Contestacao {
  id: string; apuracao_id: string; vendedor_id: string; motivo: string | null;
  valor_esperado: number | null; status: string; aberta_em: string; origem: string | null;
  resposta: string | null; respondida_em: string | null; respondida_por: string | null;
  representante: string; nf: string | null; pedido: string | null; valor_apurado: number | null;
  respondente: string | null;
}

const STATUS: Record<string, string> = {
  aberta: "Aberta", em_analise: "Em análise", procedente: "Procedente",
  improcedente: "Improcedente", cancelada: "Cancelada",
};

async function carregar(): Promise<Contestacao[]> {
  const { data, error } = await (supabase as any)
    .from("comissao_contestacao").select("*").order("aberta_em", { ascending: true });
  if (error) throw error;
  const cs = (data ?? []) as any[];
  const uniq = (a: (string | null)[]) => [...new Set(a.filter(Boolean))] as string[];
  const vIds = uniq(cs.map((c) => c.vendedor_id));
  const aIds = uniq(cs.map((c) => c.apuracao_id));
  const uIds = uniq(cs.map((c) => c.respondida_por));
  const vend = new Map<string, string>(), apur = new Map<string, any>(), nfs = new Map<string, any>(), users = new Map<string, string>();
  if (vIds.length) {
    const r = await (supabase as any).from("vendedores").select("id,nome_exibicao").in("id", vIds);
    if (r.error) throw r.error;
    for (const x of r.data ?? []) vend.set(x.id, x.nome_exibicao);
  }
  if (aIds.length) {
    const r = await (supabase as any).from("comissao_apuracao").select("id,nf_id,valor_devido").in("id", aIds);
    if (r.error) throw r.error;
    for (const x of r.data ?? []) apur.set(x.id, x);
    const nIds = uniq((r.data ?? []).map((x: any) => x.nf_id));
    if (nIds.length) {
      const n = await (supabase as any).from("nfs_emitidas")
        .select("id,numero,numero_pedido_loja,bling_pedido_venda_numero").in("id", nIds);
      if (n.error) throw n.error;
      for (const x of n.data ?? []) nfs.set(x.id, x);
    }
  }
  if (uIds.length) {
    const r = await (supabase as any).from("profiles").select("user_id,full_name").in("user_id", uIds);
    if (r.error) throw r.error;
    for (const x of r.data ?? []) users.set(x.user_id, x.full_name);
  }
  return cs.map((c) => {
    const a = apur.get(c.apuracao_id);
    const n = a ? nfs.get(a.nf_id) : null;
    return {
      ...c,
      representante: vend.get(c.vendedor_id) ?? "(sem nome)",
      nf: n?.numero ?? null,
      pedido: n?.numero_pedido_loja ?? n?.bling_pedido_venda_numero ?? null,
      valor_apurado: a?.valor_devido ?? null,
      respondente: c.respondida_por ? users.get(c.respondida_por) ?? "—" : null,
    };
  });
}

type Decisao = "em_analise" | "procedente" | "improcedente";

export function AbaContestacoes() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["comissao-contestacoes"], queryFn: carregar });
  const [alvo, setAlvo] = useState<{ c: Contestacao; d: Decisao } | null>(null);
  const [resposta, setResposta] = useState("");
  const [valor, setValor] = useState("");
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir(c: Contestacao, d: Decisao) {
    setAlvo({ c, d }); setResposta(""); setValor(""); setErro(null);
  }

  const exigeResposta = alvo?.d !== "em_analise";
  const valorNum = valor.trim() ? Number(valor.replace(",", ".")) : null;
  const valorInvalido = valorNum !== null && (!Number.isFinite(valorNum) || valorNum <= 0);
  const podeConfirmar = !rodando && !valorInvalido && (!exigeResposta || resposta.trim().length >= 10);

  async function confirmar() {
    if (!alvo) return;
    setRodando(true); setErro(null);
    try {
      const args: Record<string, unknown> = {
        p_contestacao_id: alvo.c.id, p_decisao: alvo.d, p_resposta: resposta.trim() || null,
      };
      if (alvo.d === "procedente") args.p_valor_estorno = valorNum;
      const { data, error } = await (supabase as any).rpc("fn_comissao_responder_contestacao", args);
      if (error) throw error;
      if (data && data.ok === false) { setErro(data.erro ?? JSON.stringify(data)); return; }
      toast.success(`Contestação marcada como ${STATUS[alvo.d].toLowerCase()}.`, {
        description: data?.nota ?? undefined,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-contestacoes"] }),
        qc.invalidateQueries({ queryKey: ["comissao-estornos"] }),
      ]);
      setAlvo(null);
    } catch (e) {
      setErro(formatError(e));
    } finally {
      setRodando(false);
    }
  }

  if (q.isError) return (
    <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
      <AlertDescription>Falha ao carregar contestações: {formatError(q.error)}</AlertDescription></Alert>
  );
  if (q.isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const todas = q.data ?? [];
  const ativas = todas.filter((c) => c.status === "aberta" || c.status === "em_analise");
  const encerradas = todas.filter((c) => !(c.status === "aberta" || c.status === "em_analise"));
  const cont = (s: string) => todas.filter((c) => c.status === s).length;
  const seteDias = Date.now() - 7 * 86400000;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["aberta", "em_analise", "procedente", "improcedente"] as const).map((s) => (
          <Card key={s}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{STATUS[s] === "Aberta" ? "Abertas" : STATUS[s] === "Em análise" ? "Em análise" : `${STATUS[s]}s`}</p>
            <p className="text-2xl font-semibold">{cont(s)}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contestações em aberto</CardTitle></CardHeader>
        <CardContent>
          {ativas.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma contestação em aberto.</p>
          ) : (
            <Table containerClassName="max-h-[min(70vh,48rem)]">
              <TableHeader><TableRow>
                <TableHead className="sticky left-0 top-0 z-50 w-48 border-r bg-muted">Representante</TableHead>
                <TableHead className="sticky top-0 z-40 bg-muted">NF</TableHead><TableHead className="sticky top-0 z-40 bg-muted">Pedido</TableHead>
                <TableHead className="sticky top-0 z-40 bg-muted">Aberta em</TableHead><TableHead className="sticky top-0 z-40 bg-muted">Origem</TableHead><TableHead className="sticky top-0 z-40 bg-muted">Motivo</TableHead>
                <TableHead className="sticky top-0 z-40 bg-muted text-right">Valor apurado</TableHead><TableHead className="sticky top-0 z-40 bg-muted text-right">Esperado</TableHead>
                <TableHead className="sticky top-0 z-40 bg-muted text-right">Diferença</TableHead><TableHead className="sticky top-0 z-40 bg-muted">Status</TableHead><TableHead className="sticky top-0 z-40 bg-muted" />
              </TableRow></TableHeader>

              <TableBody>
                {ativas.map((c) => {
                  const velha = new Date(c.aberta_em).getTime() < seteDias;
                  const dif = c.valor_esperado != null ? Number(c.valor_esperado) - Number(c.valor_apurado ?? 0) : null;
                  return (
                    <TableRow key={c.id} className={velha ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{c.representante}</TableCell>
                      <TableCell>{c.nf ?? "—"}</TableCell>
                      <TableCell>{c.pedido ?? "—"}</TableCell>
                      <TableCell className={velha ? "text-destructive font-medium" : ""}>{fmtData(c.aberta_em)}</TableCell>
                      <TableCell>{c.origem ?? "—"}</TableCell>
                      <TableCell className="max-w-[260px] text-xs">{c.motivo ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtBRL(c.valor_apurado)}</TableCell>
                      <TableCell className="text-right">{c.valor_esperado != null ? fmtBRL(c.valor_esperado) : "—"}</TableCell>
                      <TableCell className="text-right">{dif != null ? fmtBRL(dif) : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{STATUS[c.status] ?? c.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.status === "aberta" && <Button size="sm" variant="outline" onClick={() => abrir(c, "em_analise")}>Marcar em análise</Button>}
                          <Button size="sm" variant="outline" onClick={() => abrir(c, "procedente")}>Procedente</Button>
                          <Button size="sm" variant="outline" onClick={() => abrir(c, "improcedente")}>Improcedente</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contestações encerradas ({encerradas.length})</CardTitle>
              <ChevronDown className="h-4 w-4" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {encerradas.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma encerrada.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Representante</TableHead><TableHead>NF</TableHead><TableHead>Aberta em</TableHead>
                    <TableHead>Motivo</TableHead><TableHead>Status</TableHead><TableHead>Resposta</TableHead>
                    <TableHead>Respondida por</TableHead><TableHead>Em</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {encerradas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.representante}</TableCell>
                        <TableCell>{c.nf ?? "—"}</TableCell>
                        <TableCell>{fmtData(c.aberta_em)}</TableCell>
                        <TableCell className="max-w-[220px] text-xs">{c.motivo ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{STATUS[c.status] ?? c.status}</Badge></TableCell>
                        <TableCell className="max-w-[260px] text-xs">{c.resposta ?? "—"}</TableCell>
                        <TableCell>{c.respondente ?? "—"}</TableCell>
                        <TableCell>{fmtData(c.respondida_em)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && !rodando && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {alvo?.d === "em_analise" ? "Marcar em análise?" : alvo?.d === "procedente" ? "Contestação procedente" : "Contestação improcedente"}
            </DialogTitle>
            <DialogDescription>
              {alvo && `${alvo.c.representante} · NF ${alvo.c.nf ?? "—"} · apurado ${fmtBRL(alvo.c.valor_apurado)}`}
            </DialogDescription>
          </DialogHeader>
          {alvo?.d === "procedente" && (
            <p className="text-sm">Procedente não reescreve o valor apurado. Se houver valor a estornar, ele é abatido do próximo extrato — nunca do passado.</p>
          )}
          {alvo?.d === "improcedente" && (
            <p className="text-sm">O representante lê esta justificativa no portal. Escreva para ele, não para o sistema.</p>
          )}
          <div className="space-y-2">
            <Label>Resposta {exigeResposta ? "(obrigatória, mín. 10 caracteres)" : "(opcional)"}</Label>
            <Textarea value={resposta} onChange={(e) => setResposta(e.target.value)} disabled={rodando} />
          </div>
          {alvo?.d === "procedente" && (
            <div className="space-y-2">
              <Label>Valor a estornar (R$, opcional)</Label>
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" disabled={rodando} />
              {valorInvalido && <p className="text-xs text-destructive">Valor inválido.</p>}
            </div>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={rodando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!podeConfirmar}>{rodando && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
