import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDebounceValor } from "@/lib/lista/useListaPaginada";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { validarResultadoRessarcimento } from "@/lib/devolucao/ressarcimentoExtrato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Candidato {
  mov_id: string; conta: string | null; data_transacao: string; valor: number;
  descricao: string | null; contraparte_nome: string | null; diferenca: number;
}

export function RessarcimentoExtrato({ devolucaoId, movimentoId, valor }: { devolucaoId: string; movimentoId: string | null; valor: number | null }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [desfazer, setDesfazer] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = useDebounceValor(busca, 300);
  const candidatos = useQuery({
    queryKey: ["devolucao", "ressarcimento-candidatos", devolucaoId, termo],
    enabled: aberto && !movimentoId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_ressarcimento_candidatos", { p_devolucao_id: devolucaoId, p_busca: termo.trim() || null });
      if (error) throw error;
      return (data ?? []) as Candidato[];
    },
  });
  const movimento = useQuery({
    queryKey: ["devolucao", "ressarcimento-movimento", movimentoId], enabled: !!movimentoId,
    queryFn: async () => {
      if (!movimentoId) throw new Error("Lançamento não informado.");
      const { data, error } = await supabase.from("movimentacoes_bancarias")
        .select("id,data_transacao,conta_bancaria_id,descricao,contraparte_nome,valor").eq("id", movimentoId).single();
      if (error) throw error;
      const conta = data.conta_bancaria_id ? await supabase.from("contas_bancarias").select("banco").eq("id", data.conta_bancaria_id).single() : null;
      if (conta?.error) throw conta.error;
      return { ...data, conta: conta?.data?.banco ?? "—" };
    },
  });
  const atualizar = async () => {
    await qc.invalidateQueries({ predicate: q => q.queryKey.some(k => typeof k === "string" && (k.includes("devolucao") || k.includes("devolucoes") || k.includes("extrato-conta"))) });
  };
  const vincular = useMutation({
    mutationFn: async (movId: string) => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_vincular_ressarcimento", { p_devolucao_id: devolucaoId, p_mov_id: movId });
      if (error) throw error;
      return validarResultadoRessarcimento(data);
    },
    onSuccess: async r => {
      const diferenca = Number(r.diferenca ?? 0);
      toast.success(`Ressarcimento vinculado${r.encerramento?.encerrou ? " · Devolução encerrada" : ""}`);
      if (diferenca !== 0) toast.warning(`Diferença vs. valor da devolução: ${formatBRL(diferenca)}`);
      await atualizar();
      setAberto(false);
    },
    onError: e => toast.error(rawMessage(e)),
  });
  const desvincular = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_desvincular_ressarcimento", { p_devolucao_id: devolucaoId });
      if (error) throw error;
      return validarResultadoRessarcimento(data);
    },
    onSuccess: async () => { toast.success("Ressarcimento desvinculado"); await atualizar(); setDesfazer(false); },
    onError: e => toast.error(rawMessage(e)),
  });
  return <section className="mx-2 mb-2 space-y-2 rounded-md border bg-card p-3 text-sm">
    <h3 className="text-xs font-medium text-muted-foreground">Ressarcimento por extrato</h3>
    {movimentoId ? <>
      {movimento.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : movimento.error ? <Alert variant="destructive"><AlertDescription>{rawMessage(movimento.error)}</AlertDescription></Alert> : movimento.data && <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1"><div>{formatDateBR(movimento.data.data_transacao)} · {movimento.data.conta}</div><div className="break-words">{movimento.data.descricao}</div>{movimento.data.contraparte_nome && <div className="text-xs text-muted-foreground">{movimento.data.contraparte_nome}</div>}<div className="font-medium tabular-nums">{formatBRL(movimento.data.valor)}</div></div>
        <Button size="sm" variant="outline" onClick={() => setDesfazer(true)} disabled={desvincular.isPending}><Undo2 className="mr-2 h-4 w-4" />Desfazer</Button>
      </div>}
    </> : <Button size="sm" variant="outline" onClick={() => { setBusca(""); setAberto(true); }}><Link2 className="mr-2 h-4 w-4" />Vincular lançamento do extrato</Button>}
    <Dialog open={aberto} onOpenChange={v => { if (!vincular.isPending) setAberto(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Vincular lançamento do extrato</DialogTitle><DialogDescription>Valor da devolução: {formatBRL(valor ?? 0)}</DialogDescription></DialogHeader>
        <Input aria-label="Buscar lançamento" placeholder="Valor, nome ou CPF" value={busca} onChange={e => setBusca(e.target.value)} disabled={vincular.isPending} />
        {candidatos.isFetching ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : candidatos.error ? <Alert variant="destructive"><AlertDescription>{rawMessage(candidatos.error)}</AlertDescription></Alert> : !(candidatos.data ?? []).length ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma saída encontrada nas contas importadas.</p> : <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Conta</TableHead><TableHead>Descrição/contraparte</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{candidatos.data?.map(c => <TableRow key={c.mov_id}>
            <TableCell className="whitespace-nowrap">{formatDateBR(c.data_transacao)}</TableCell><TableCell>{c.conta ?? "—"}</TableCell><TableCell className="min-w-40 whitespace-normal"><div>{c.descricao ?? "—"}</div>{c.contraparte_nome && <div className="text-xs text-muted-foreground">{c.contraparte_nome}</div>}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatBRL(c.valor)}</TableCell><TableCell className={cn("text-right tabular-nums whitespace-nowrap", Number(c.diferenca) !== 0 && "font-medium text-warning")}>{formatBRL(c.diferenca)}</TableCell>
            <TableCell><Button size="sm" disabled={vincular.isPending} onClick={async () => { try { await vincular.mutateAsync(c.mov_id); } catch { /* onError mostra a mensagem do banco */ } }}>{vincular.isPending && vincular.variables === c.mov_id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={desfazer} onOpenChange={v => { if (!desvincular.isPending) setDesfazer(v); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Desfazer vínculo do ressarcimento?</AlertDialogTitle><AlertDialogDescription>O lançamento será desvinculado desta devolução.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={desvincular.isPending}>Cancelar</AlertDialogCancel><Button disabled={desvincular.isPending} onClick={async () => { try { await desvincular.mutateAsync(); } catch { /* onError mostra a mensagem do banco */ } }}>{desvincular.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Desfazer</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}