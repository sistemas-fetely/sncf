import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtBRL, fmtPct } from "./fmt";

interface Pendente {
  id: string; vendedor_id: string; nf_id: string | null; base_total: number; desconto_pct: number; valor_devido: number;
  representante: string; nf: string; pedido: string;
}

export function MesaDiretoria() {
  const qc = useQueryClient();
  const [dec, setDec] = useState<{ p: Pendente; tipo: "aprovar" | "recusar" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  const q = useQuery({
    queryKey: ["comissao-aguardando-diretoria"],
    queryFn: async (): Promise<Pendente[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_apuracao")
        .select("id,vendedor_id,nf_id,base_total,desconto_pct,valor_devido")
        .eq("status", "aguardando_diretoria")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      const ls = (data ?? []) as Omit<Pendente, "representante" | "nf" | "pedido">[];
      if (!ls.length) return [];
      const vIds = [...new Set(ls.map((l) => l.vendedor_id))];
      const nIds = [...new Set(ls.map((l) => l.nf_id).filter(Boolean))] as string[];
      const [v, n] = await Promise.all([
        (supabase as any).from("vendedores").select("id,nome_exibicao").in("id", vIds),
        nIds.length ? (supabase as any).from("nfs_emitidas").select("id,numero,numero_pedido_loja,bling_pedido_venda_numero").in("id", nIds) : { data: [], error: null },
      ]);
      if (v.error) throw v.error;
      if (n.error) throw n.error;
      const vm = new Map((v.data ?? []).map((x: any) => [x.id, x.nome_exibicao]));
      const nm = new Map((n.data ?? []).map((x: any) => [x.id, x]));
      return ls.map((l) => {
        const nf: any = l.nf_id ? nm.get(l.nf_id) : null;
        return {
          ...l,
          representante: String(vm.get(l.vendedor_id) ?? "(sem nome)"),
          nf: nf?.numero ?? "—",
          pedido: nf?.numero_pedido_loja ?? nf?.bling_pedido_venda_numero ?? "—",
        };
      });
    },
  });

  function abrir(p: Pendente, tipo: "aprovar" | "recusar") { setDec({ p, tipo }); setMotivo(""); setErro(null); }

  async function decidir() {
    if (!dec) return;
    setRodando(true); setErro(null);
    try {
      const args: Record<string, unknown> = { p_apuracao_id: dec.p.id, p_decisao: dec.tipo };
      if (dec.tipo === "recusar") args.p_motivo = motivo.trim();
      const { data, error } = await (supabase as any).rpc("fn_comissao_decidir_diretoria", args);
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; erro?: string; nota?: string };
      if (r.ok !== true) { setErro(r.erro ?? `O banco não confirmou a decisão: ${JSON.stringify(data)}`); return; }
      toast.success(r.nota ?? (dec.tipo === "aprovar" ? "Comissão aprovada." : "Comissão recusada."));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-aguardando-diretoria"] }),
        qc.invalidateQueries({ queryKey: ["comissao-a-apurar"] }),
        qc.invalidateQueries({ queryKey: ["comissao-posicao"] }),
      ]);
      setDec(null);
    } catch (e) {
      setErro(formatError(e));
    } finally {
      setRodando(false);
    }
  }

  if (q.isError)
    return <Alert variant="destructive"><AlertDescription>Falha ao carregar comissões aguardando diretoria: {formatError(q.error)}</AlertDescription></Alert>;
  if (!q.data || q.data.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Aguardando decisão da diretoria ({q.data.length})</CardTitle>
        <p className="text-xs text-muted-foreground">
          Desconto acima de 15% não libera comissão sozinho. A diretoria decide, e a decisão fica registrada com autor e data.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Representante</TableHead><TableHead>NF</TableHead><TableHead>Pedido</TableHead>
            <TableHead className="text-right">Base</TableHead><TableHead className="text-right">Desconto</TableHead>
            <TableHead className="text-right">Valor devido</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {q.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.representante}</TableCell>
                <TableCell>{p.nf}</TableCell>
                <TableCell>{p.pedido}</TableCell>
                <TableCell className="text-right">{fmtBRL(p.base_total)}</TableCell>
                <TableCell className="text-right">{fmtPct(p.desconto_pct)}</TableCell>
                <TableCell className="text-right font-medium">{fmtBRL(p.valor_devido)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" className="mr-1" onClick={() => abrir(p, "aprovar")}>Aprovar</Button>
                  <Button size="sm" variant="outline" onClick={() => abrir(p, "recusar")}>Recusar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!dec} onOpenChange={(o) => !o && !rodando && setDec(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dec?.tipo === "aprovar" ? "Aprovar comissão?" : "Recusar comissão"}</DialogTitle>
            <DialogDescription>
              {dec && `${dec.p.representante} · NF ${dec.p.nf} · desconto ${fmtPct(dec.p.desconto_pct)} · ${fmtBRL(dec.p.valor_devido)}`}
            </DialogDescription>
          </DialogHeader>
          {dec?.tipo === "recusar" && (
            <div className="space-y-1">
              <Label htmlFor="motivo-recusa">Motivo da recusa *</Label>
              <Textarea id="motivo-recusa" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDec(null)} disabled={rodando}>Cancelar</Button>
            <Button onClick={decidir} variant={dec?.tipo === "recusar" ? "destructive" : "default"}
              disabled={rodando || (dec?.tipo === "recusar" && !motivo.trim())}>
              {rodando && <Loader2 className="h-4 w-4 animate-spin" />}
              {dec?.tipo === "aprovar" ? "Aprovar" : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
