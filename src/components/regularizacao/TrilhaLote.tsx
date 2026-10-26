/** Aba "Trilha" do lote de Transferência Fiscal: ida e retorno por NF de origem + NFs 6152 do TRS. */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/ui/selo";
import { RegularizacaoStatus } from "@/components/regularizacao/RegularizacaoStatus";
import type { RegularizacaoLote, RegularizacaoRetorno, TrsNf } from "@/components/regularizacao/types";

const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR");
const autorizada = (s: string | null) => /autoriz|emitid/i.test(s ?? "");

export function TrilhaLote({ lote, retornos }: { lote: RegularizacaoLote; retornos: RegularizacaoRetorno[] }) {
  const trsQ = useQuery({ queryKey: ["regularizacao", "trs-nf", lote.id], refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.from("vw_regularizacao_trs_nf").select("*").eq("lote_id", lote.id).order("data_emissao", { ascending: true });
    if (error) throw error; return (data ?? []) as TrsNf[];
  } });
  const nfs = trsQ.data ?? [];
  const retornado = retornos.filter((r) => r.status === "autorizada").reduce((s, r) => s + Number(r.pecas ?? 0), 0);
  const na6152 = nfs.reduce((s, r) => s + Number(r.pecas_nf ?? 0), 0);
  const entrou = lote.pecas_entradas ?? nfs.reduce((s, r) => s + Number(r.pecas_entradas ?? 0), 0);

  return <div className="space-y-5">
    <section className="space-y-2"><h3 className="text-sm font-semibold">Ida e retorno</h3>
      <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>NF origem</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Peças</TableHead><TableHead /><TableHead>NF de retorno</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{retornos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhuma NF de origem distribuída.</TableCell></TableRow> : retornos.map((r) => <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.nf_origem_numero}</TableCell><TableCell>{formatDateBR(r.nf_origem_data)}</TableCell><TableCell className="text-right tabular-nums">{n(r.pecas)}</TableCell><TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell><TableCell className="font-mono text-xs">{r.nf_retorno_numero ?? "—"}</TableCell><TableCell><RegularizacaoStatus status={r.status} /></TableCell></TableRow>)}</TableBody></Table></div>
    </section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Transferência 6152{lote.trs_numero ? ` · ${lote.trs_numero}` : ""}</h3>
      <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>NF</TableHead><TableHead>Situação</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Peças da NF</TableHead><TableHead className="text-right">Entraram no estoque</TableHead></TableRow></TableHeader>
        <TableBody>{trsQ.isLoading ? <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Carregando…</TableCell></TableRow> : trsQ.isError ? <TableRow><TableCell colSpan={6} className="text-sm text-destructive">{rawMessage(trsQ.error)}</TableCell></TableRow> : nfs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhuma NF 6152 ainda.</TableCell></TableRow> : nfs.map((r) => { const falta = Number(r.pecas_entradas ?? 0) < Number(r.pecas_nf ?? 0); return <TableRow key={r.nf_id} className={falta ? "bg-warning/10" : undefined}><TableCell className="font-mono text-xs">{r.numero ?? "—"}</TableCell><TableCell><Selo estado={autorizada(r.situacao) ? "success" : "warning"}>{r.situacao ?? "—"}</Selo></TableCell><TableCell>{formatDateBR(r.data_emissao)}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(r.valor_nota)}</TableCell><TableCell className="text-right tabular-nums">{n(r.pecas_nf)}</TableCell><TableCell className={`text-right tabular-nums ${falta ? "font-medium text-warning" : ""}`}>{n(r.pecas_entradas)}</TableCell></TableRow>; })}</TableBody></Table></div>
    </section>
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm"><span>Contado <strong className="tabular-nums">{n(lote.pecas_inventario)}</strong></span><ArrowRight className="h-4 w-4 text-muted-foreground" /><span>Retornado <strong className="tabular-nums">{n(retornado)}</strong></span><ArrowRight className="h-4 w-4 text-muted-foreground" /><span>Na(s) 6152 <strong className="tabular-nums">{n(na6152)}</strong></span><ArrowRight className="h-4 w-4 text-muted-foreground" /><span>Entrou no estoque <strong className={`tabular-nums ${entrou < na6152 ? "text-warning" : ""}`}>{n(entrou)}</strong></span></div>
  </div>;
}
