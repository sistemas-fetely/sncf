import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2, Undo2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtBRL, fmtData } from "./fmt";

export const TIPOS_ESTORNO: Record<string, string> = {
  nf_cancelada: "NF cancelada",
  nf_substituida: "NF substituída",
  devolucao: "Devolução",
  titulo_revertido: "Título revertido",
  correcao_manual: "Correção manual",
};

export function EstornarBotao({ apuracaoId, nf, representante, valorDevido, liberado }: {
  apuracaoId: string; nf: string | null; representante: string | null;
  valorDevido: number | null; liberado: number | null;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { if (aberto) { setTipo(""); setValor(""); setMotivo(""); setErro(null); } }, [aberto]);

  const jaEstornado = useQuery({
    queryKey: ["comissao-estornado", apuracaoId],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("comissao_estorno").select("valor_estornado").eq("apuracao_id", apuracaoId);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.valor_estornado ?? 0), 0) as number;
    },
  });

  const valorNum = valor.trim() ? Number(valor.replace(",", ".")) : null;
  const valorInvalido = valorNum !== null && (!Number.isFinite(valorNum) || valorNum <= 0);
  const pode = !rodando && !!tipo && motivo.trim().length >= 10 && !valorInvalido;

  async function confirmar() {
    setRodando(true); setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc("fn_comissao_estornar", {
        p_apuracao_id: apuracaoId, p_tipo: tipo, p_motivo: motivo.trim(), p_valor: valorNum,
      });
      if (error) throw error;
      if (!data || data.ok !== true) {
        const max = data?.maximo_estornavel;
        setErro(`${data?.erro ?? JSON.stringify(data)}${max != null ? ` · Máximo estornável: ${fmtBRL(max)}` : ""}`);
        return;
      }
      toast.success("Estorno lançado.", { description: data.nota ?? undefined });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-estornos"] }),
        qc.invalidateQueries({ queryKey: ["comissao-estornado", apuracaoId] }),
        qc.invalidateQueries({ queryKey: ["comissao-posicao"] }),
      ]);
      setAberto(false);
    } catch (e) {
      setErro(formatError(e));
    } finally {
      setRodando(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><Undo2 className="h-4 w-4" />Estornar</Button>
      <Dialog open={aberto} onOpenChange={(o) => !rodando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar comissão · NF {nf ?? "—"}</DialogTitle>
            <DialogDescription>{representante ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Apurado</p><p className="font-medium">{fmtBRL(valorDevido)}</p></div>
            <div><p className="text-xs text-muted-foreground">Já liberado</p><p className="font-medium">{fmtBRL(liberado)}</p></div>
            <div><p className="text-xs text-muted-foreground">Já estornado</p>
              <p className="font-medium">{jaEstornado.isLoading ? "…" : jaEstornado.isError ? <span className="text-destructive">{formatError(jaEstornado.error)}</span> : fmtBRL(jaEstornado.data)}</p></div>
          </div>
          <div className="space-y-2">
            <Label>Tipo do estorno</Label>
            <Select value={tipo} onValueChange={setTipo} disabled={rodando}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS_ESTORNO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor a estornar (R$, vazio = saldo total)</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" disabled={rodando} />
            {valorInvalido && <p className="text-xs text-destructive">Valor inválido.</p>}
          </div>
          <div className="space-y-2">
            <Label>Motivo (mín. 10 caracteres)</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={rodando} />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmar} disabled={!pode}>{rodando && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar estorno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EstornosLancados() {
  const q = useQuery({
    queryKey: ["comissao-estornos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("comissao_estorno").select("*").order("criado_em", { ascending: false });
      if (error) throw error;
      const es = (data ?? []) as any[];
      const vIds = [...new Set(es.map((e) => e.vendedor_id).filter(Boolean))];
      const aIds = [...new Set(es.map((e) => e.apuracao_id).filter(Boolean))];
      const vend = new Map<string, string>(), nfDe = new Map<string, string>();
      if (vIds.length) {
        const r = await (supabase as any).from("vendedores").select("id,nome_exibicao").in("id", vIds);
        if (r.error) throw r.error;
        for (const x of r.data ?? []) vend.set(x.id, x.nome_exibicao);
      }
      if (aIds.length) {
        const r = await (supabase as any).from("comissao_apuracao").select("id,nf_id").in("id", aIds);
        if (r.error) throw r.error;
        const nIds = [...new Set((r.data ?? []).map((x: any) => x.nf_id).filter(Boolean))];
        const nums = new Map<string, string>();
        if (nIds.length) {
          const n = await (supabase as any).from("nfs_emitidas").select("id,numero").in("id", nIds);
          if (n.error) throw n.error;
          for (const x of n.data ?? []) nums.set(x.id, x.numero);
        }
        for (const x of r.data ?? []) nfDe.set(x.id, nums.get(x.nf_id) ?? "—");
      }
      return es.map((e) => ({ ...e, representante: vend.get(e.vendedor_id) ?? "(sem nome)", nf: nfDe.get(e.apuracao_id) ?? "—" }));
    },
  });

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
            <CardTitle className="text-base">Estornos lançados{q.data ? ` (${q.data.length})` : ""}</CardTitle>
            <ChevronDown className="h-4 w-4" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {q.isError ? (
              <Alert variant="destructive"><AlertDescription>Falha ao carregar estornos: {formatError(q.error)}</AlertDescription></Alert>
            ) : q.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (q.data ?? []).length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhum estorno lançado.</p>
            ) : (
              <TooltipProvider>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Representante</TableHead><TableHead>NF</TableHead><TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Estornado</TableHead><TableHead className="text-right">Já compensado</TableHead>
                    <TableHead>Motivo</TableHead><TableHead>Data</TableHead><TableHead>Situação</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(q.data ?? []).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.representante}</TableCell>
                        <TableCell>{e.nf}</TableCell>
                        <TableCell>{TIPOS_ESTORNO[e.tipo] ?? e.tipo}</TableCell>
                        <TableCell className="text-right">{fmtBRL(e.valor_estornado)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(e.valor_compensado)}</TableCell>
                        <TableCell className="max-w-[260px] text-xs">{e.motivo ?? "—"}</TableCell>
                        <TableCell>{fmtData(e.criado_em)}</TableCell>
                        <TableCell>
                          {e.compensado_em ? (
                            <Badge variant="outline" className="bg-success/15 text-success border-success/30">Compensado</Badge>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild><span><Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Pendente de compensação</Badge></span></TooltipTrigger>
                              <TooltipContent>Será abatido do próximo extrato fechado deste representante.</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
