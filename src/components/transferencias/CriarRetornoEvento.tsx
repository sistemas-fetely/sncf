import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";
import { exigirResultado } from "./useRetornoEvento";

export function CriarRetornoEvento() {
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const elegiveis = useQuery({ queryKey: ["ti-retorno-elegiveis"], queryFn: async () => {
    const { data: fins, error: fe } = await supabase.from("transferencia_finalidade").select("id").not("natureza_nf_retorno_id", "is", null);
    if (fe) throw fe;
    if (!fins.length) return [];
    const pedidos = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase.from("pedidos").select("id,id_externo,entregue_em,origem_centro_id,destino_centro_id").eq("estagio", "entregue").in("transferencia_finalidade_id", fins.map((f) => f.id)).order("id").range(inicio, inicio + 999);
      if (error) throw error;
      pedidos.push(...data);
      if (data.length < 1000) break;
    }
    const { data: centros, error: ce } = await supabase.from("centro_distribuicao").select("id,codigo,rotulo_curto,nome");
    if (ce) throw ce;
    const cm = new Map(centros.map((c) => [c.id, c]));
    const result = [];
    for (const p of pedidos) {
      const [{ data: exige, error: ee }, { data: retorno, error: re }, { data: nf, error: ne }] = await Promise.all([
        supabase.rpc("fn_ti_exige_nf", { p_pedido_id: p.id }),
        supabase.from("ti_retorno").select("pedido_id").eq("pedido_id", p.id).maybeSingle(),
        supabase.from("nfs_emitidas").select("numero").eq("pedido_venda_id", p.id).eq("tipo", "saida").eq("situacao", "autorizada").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      for (const e of [ee, re, ne]) if (e) throw e;
      if (!exige || retorno || !nf) continue;
      const { data: itens, error: ie } = await supabase.from("pedido_itens").select("sku,quantidade").eq("pedido_id", p.id);
      if (ie) throw ie;
      const somas = new Map<string, number>();
      for (const i of itens) somas.set(i.sku, (somas.get(i.sku) ?? 0) + Number(i.quantidade));
      const agregados = [...somas].map(([sku, quantidade]) => ({ sku, quantidade }));
      let kits = 0;
      for (let inicio = 0; inicio < agregados.length; inicio += 200) {
        const lote = agregados.slice(inicio, inicio + 200);
        const { data: saldos, error: se } = await supabase.from("vw_estoque_centro").select("sku,disponivel").eq("centro_id", p.destino_centro_id ?? "").in("sku", lote.map((i) => i.sku));
        if (se) throw se;
        const m = new Map<string, number>();
        for (const s of saldos) if (s.sku) m.set(s.sku, (m.get(s.sku) ?? 0) + Number(s.disponivel ?? 0));
        kits += lote.reduce((s, i) => s + Math.max(0, Math.min(Number(i.quantidade), m.get(i.sku) ?? 0)), 0);
      }
      const rotulo = (id: string | null) => { const c = id ? cm.get(id) : null; return c?.rotulo_curto ?? c?.nome ?? c?.codigo ?? "—"; };
      result.push({ ...p, origem: rotulo(p.origem_centro_id), destino: rotulo(p.destino_centro_id), nf: nf.numero, kits });
    }
    return result;
  } });
  const criar = useMutation({ mutationFn: async (id: string) => {
    const { data, error } = await supabase.rpc("fn_ti_retorno_criar", { p_remessa_id: id });
    if (error) throw error;
    return exigirResultado(data);
  }, onSuccess: async (r) => {
    await qc.invalidateQueries();
    toast.success(`${r.id_externo ?? "TI"} criada — retorno a receber no destino.`);
    setParams((p) => { const n = new URLSearchParams(p); n.set("aba", "receber"); n.delete("tipo"); return n; });
  }, onError: (e) => toast.error(formatError(e)) });
  return <section className="mt-4 space-y-3">
    <h3 className="font-medium">Retorno do evento</h3>
    {elegiveis.isError ? <p className="text-sm text-destructive">{formatError(elegiveis.error)}</p> : elegiveis.isPending ? <p className="text-muted-foreground">Carregando remessas…</p> : !elegiveis.data.length ? <p className="text-muted-foreground">Nenhuma remessa elegível para retorno.</p> :
      <Table><TableHeader><TableRow><TableHead>Remessa</TableHead><TableHead>Origem → Destino</TableHead><TableHead>Entrega</TableHead><TableHead>NF de remessa</TableHead><TableHead>Kits no CD agora</TableHead><TableHead /></TableRow></TableHeader><TableBody>{elegiveis.data.map((p) => <TableRow key={p.id}><TableCell>{p.id_externo}</TableCell><TableCell>{p.origem} → {p.destino}</TableCell><TableCell>{fmtData(p.entregue_em)}</TableCell><TableCell>{p.nf}</TableCell><TableCell>{p.kits}</TableCell><TableCell><Button type="button" disabled={criar.isPending} onClick={() => criar.mutate(p.id)}>Criar retorno</Button></TableCell></TableRow>)}</TableBody></Table>}
  </section>;
}