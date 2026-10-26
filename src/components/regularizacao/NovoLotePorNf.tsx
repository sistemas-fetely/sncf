/** Novo lote de Transferência Fiscal a partir de NFs de remessa (reg_lote_criar_por_nf). */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RemessaSaldo } from "@/components/regularizacao/types";

interface Centro { codigo: string; nome: string; rotulo_curto: string | null }
interface Props { centros: Centro[]; onCancelar: () => void; onCriado: (r: { id: string; codigo: string }) => void }
const n = (v: number) => Number(v ?? 0).toLocaleString("pt-BR");

export function NovoLotePorNf({ centros, onCancelar, onCriado }: Props) {
  const [busca, setBusca] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set());
  const [centro, setCentro] = useState(""); const [centroEditado, setCentroEditado] = useState(false);
  const [titulo, setTitulo] = useState(""); const [observacao, setObservacao] = useState("");
  const [itensAbertos, setItensAbertos] = useState(false); const [qtds, setQtds] = useState<Record<string, number>>({});

  const nfsQ = useQuery({ queryKey: ["regularizacao", "remessa-saldo"], queryFn: async () => {
    const { data, error } = await supabase.from("vw_reg_remessa_saldo").select("*").gt("pecas_disponiveis", 0).order("data_emissao", { ascending: false });
    if (error) throw error; return (data ?? []) as RemessaSaldo[];
  } });
  const nfs = nfsQ.data ?? [];
  const filtradas = useMemo(() => { const t = busca.trim().toLocaleLowerCase("pt-BR"); return t ? nfs.filter((r) => `${r.numero ?? ""} ${r.pedido ?? ""}`.toLocaleLowerCase("pt-BR").includes(t)) : nfs; }, [nfs, busca]);
  const marcadas = useMemo(() => nfs.filter((r) => sel.has(r.nf_id)), [nfs, sel]);
  const idsSel = useMemo(() => Array.from(sel).sort(), [sel]);

  const sugeridos = useMemo(() => Array.from(new Set(marcadas.map((r) => r.centro_sugerido_codigo ?? ""))), [marcadas]);
  const sugeridoUnico = sugeridos.length === 1 && sugeridos[0] ? sugeridos[0] : null;
  useEffect(() => { if (!centroEditado) setCentro(sugeridoUnico ?? ""); }, [sugeridoUnico, centroEditado]);
  useEffect(() => { setQtds({}); }, [idsSel.join("|")]);

  const itensQ = useQuery({ queryKey: ["regularizacao", "remessa-saldo-item", idsSel.join("|")], enabled: idsSel.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("vw_reg_remessa_saldo_item").select("sku,descricao,qtd_disponivel").in("nf_id", idsSel).gt("qtd_disponivel", 0);
    if (error) throw error;
    const mapa = new Map<string, { sku: string; descricao: string | null; disponivel: number }>();
    for (const r of data ?? []) { if (!r.sku) continue; const a = mapa.get(r.sku) ?? { sku: r.sku, descricao: r.descricao, disponivel: 0 }; a.disponivel += Number(r.qtd_disponivel ?? 0); mapa.set(r.sku, a); }
    return Array.from(mapa.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  } });
  const itens = itensQ.data ?? [];
  const editou = Object.keys(qtds).length > 0;
  const qtdDe = (sku: string, disp: number) => qtds[sku] ?? disp;
  const skus = itens.filter((i) => qtdDe(i.sku, i.disponivel) > 0).length;
  const pecas = itensQ.data ? itens.reduce((s, i) => s + qtdDe(i.sku, i.disponivel), 0) : marcadas.reduce((s, r) => s + Number(r.pecas_disponiveis ?? 0), 0);

  const alternar = (id: string) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const criar = useMutation({ mutationFn: async () => {
    if (!idsSel.length) throw new Error("Marque ao menos uma NF de remessa.");
    if (!centro) throw new Error("Escolha o centro destino (as NFs marcadas sugerem centros diferentes).");
    let pItens: { sku: string; quantidade: number }[] | null = null;
    if (editou) {
      for (const i of itens) { const q = qtdDe(i.sku, i.disponivel); if (!Number.isFinite(q) || q < 0 || q > i.disponivel) throw new Error(`Quantidade inválida para ${i.sku} (0 a ${n(i.disponivel)}).`); }
      pItens = itens.map((i) => ({ sku: i.sku, quantidade: qtdDe(i.sku, i.disponivel) })).filter((i) => i.quantidade > 0);
      if (!pItens.length) throw new Error("Todas as quantidades estão em 0.");
    }
    const { data, error } = await supabase.rpc("reg_lote_criar_por_nf", { p_nf_ids: idsSel, p_centro_destino_codigo: centro, p_itens: pItens as never, p_titulo: titulo.trim() || undefined, p_observacao: observacao.trim() || undefined });
    if (error) throw error;
    const out = data as { lote_id?: string; codigo?: string } | null; const id = String(out?.lote_id ?? "");
    if (!id) throw new Error("O banco não retornou o lote criado.");
    return { id, codigo: String(out?.codigo ?? "") };
  }, onSuccess: onCriado, onError: (e) => toast.error(rawMessage(e)) });

  return <div className="space-y-4">
    <Input placeholder="Buscar NF ou pedido…" value={busca} onChange={(e) => setBusca(e.target.value)} />
    <div className="max-h-64 overflow-auto rounded-md border">
      {nfsQ.isLoading ? <p className="p-4 text-sm text-muted-foreground">Carregando NFs de remessa…</p> : nfsQ.isError ? <p className="p-4 text-sm text-destructive">{rawMessage(nfsQ.error)}</p> : filtradas.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma NF de remessa com saldo disponível.</p> :
        <Table><TableHeader><TableRow><TableHead className="w-8" /><TableHead>NF</TableHead><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Destino sugerido</TableHead><TableHead className="text-right">Remetidas</TableHead><TableHead className="text-right">Já retornadas</TableHead><TableHead className="text-right">Disponíveis</TableHead><TableHead className="text-right">Valor disponível</TableHead><TableHead>Lotes</TableHead></TableRow></TableHeader>
          <TableBody>{filtradas.map((r) => <TableRow key={r.nf_id} className="cursor-pointer" onClick={() => alternar(r.nf_id)}><TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={sel.has(r.nf_id)} onCheckedChange={() => alternar(r.nf_id)} /></TableCell><TableCell className="font-mono text-xs">{r.numero}</TableCell><TableCell className="whitespace-nowrap">{formatDateBR(r.data_emissao)}</TableCell><TableCell>{r.pedido ?? "—"}</TableCell><TableCell>{r.centro_sugerido_rotulo ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{n(r.pecas_remetidas)}</TableCell><TableCell className="text-right tabular-nums">{n(r.pecas_retornadas)}</TableCell><TableCell className="text-right font-medium tabular-nums">{n(r.pecas_disponiveis)}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(r.valor_disponivel)}</TableCell><TableCell className="text-xs">{r.lotes || "—"}</TableCell></TableRow>)}</TableBody></Table>}
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5"><Label>Centro destino *</Label><Select value={centro} onValueChange={(v) => { setCentro(v); setCentroEditado(true); }}><SelectTrigger><SelectValue placeholder={sugeridos.length > 1 ? "NFs com destinos diferentes — escolha" : "Selecione"} /></SelectTrigger><SelectContent>{centros.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Título</Label><Input value={titulo} placeholder="Gerado pelo sistema se vazio" onChange={(e) => setTitulo(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Observação</Label><Input value={observacao} onChange={(e) => setObservacao(e.target.value)} /></div>
    </div>
    {idsSel.length > 0 && <div className="rounded-md border">
      <button type="button" className="flex w-full items-center gap-2 p-3 text-sm font-medium" onClick={() => setItensAbertos((v) => !v)}>{itensAbertos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Itens{editou && <span className="text-xs font-normal text-warning">· quantidades editadas</span>}</button>
      {itensAbertos && <div className="max-h-64 overflow-auto border-t">{itensQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando itens…</p> : itensQ.isError ? <p className="p-3 text-sm text-destructive">{rawMessage(itensQ.error)}</p> :
        <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Disponível</TableHead><TableHead className="w-28">Quantidade</TableHead></TableRow></TableHeader><TableBody>{itens.map((i) => <TableRow key={i.sku}><TableCell className="font-mono text-xs">{i.sku}</TableCell><TableCell className="max-w-64 truncate text-xs" title={i.descricao ?? ""}>{i.descricao ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{n(i.disponivel)}</TableCell><TableCell><Input type="number" min={0} max={i.disponivel} className="h-8" value={qtdDe(i.sku, i.disponivel)} onChange={(e) => setQtds((q) => ({ ...q, [i.sku]: Number(e.target.value) }))} /></TableCell></TableRow>)}</TableBody></Table>}</div>}
    </div>}
    <DialogFooter className="items-center sm:justify-between"><span className="text-xs text-muted-foreground">{idsSel.length} NFs · {itensQ.data ? skus : "—"} SKUs · {n(pecas)} peças</span><div className="flex gap-2"><Button variant="outline" onClick={onCancelar}>Cancelar</Button><Button onClick={() => criar.mutate()} disabled={criar.isPending}>{criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lote</Button></div></DialogFooter>
  </div>;
}
