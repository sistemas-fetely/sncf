import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props { aberto: boolean; onOpenChange: (v: boolean) => void; }
function parseInventario(texto: string) {
  const mapa = new Map<string, number>();
  const invalidas: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim();
    if (!linha) return;
    const partes = linha.split(/[\t;,]/).map((v) => v.trim());
    const sku = partes[0] ?? "";
    const qtd = Number((partes[1] ?? "").replace(",", "."));
    if (i === 0 && /sku|c[oó]digo/i.test(sku) && !Number.isFinite(qtd)) return;
    if (!sku || !Number.isFinite(qtd) || qtd <= 0) { invalidas.push(`Linha ${i + 1}: ${bruta}`); return; }
    mapa.set(sku, (mapa.get(sku) ?? 0) + qtd);
  });
  return { itens: Array.from(mapa, ([sku, quantidade]) => ({ sku, quantidade })), invalidas };
}

export function NovoLoteDialog({ aberto, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState(""); const [centro, setCentro] = useState("");
  const [data, setData] = useState(""); const [observacao, setObservacao] = useState("");
  const [texto, setTexto] = useState("");
  const previa = useMemo(() => parseInventario(texto), [texto]);
  const pecas = previa.itens.reduce((s, i) => s + i.quantidade, 0);
  const centrosQ = useQuery({ queryKey: ["regularizacao", "centros"], staleTime: 10 * 60 * 1000, queryFn: async () => {
    const { data: rows, error } = await supabase.from("centro_distribuicao").select("codigo,nome,rotulo_curto").eq("ativo", true).eq("vende", true).order("ordem");
    if (error) throw error; return rows ?? [];
  }});
  const criar = useMutation({ mutationFn: async () => {
    if (!titulo.trim() || !centro || !data || previa.itens.length === 0 || previa.invalidas.length) throw new Error("Preencha os campos obrigatórios e corrija as linhas inválidas.");
    const { data: out, error } = await supabase.rpc("reg_lote_criar", { p_titulo: titulo.trim(), p_centro_destino_codigo: centro, p_data_inventario: data, p_itens: previa.itens, p_observacao: observacao.trim() || undefined });
    if (error) throw error; const id = String((out as { lote_id?: string } | null)?.lote_id ?? ""); if (!id) throw new Error("O banco não retornou o lote criado.");
    const { error: distError } = await supabase.rpc("reg_lote_distribuir", { p_lote_id: id }); if (distError) throw distError; return { id, codigo: String((out as { codigo?: string } | null)?.codigo ?? "") };
  }, onSuccess: ({ id, codigo }) => { toast.success(`Lote ${codigo || ""} criado e distribuído.`.replace(/\s+\./, ".")); onOpenChange(false); navigate(`/estoque/regularizacao/${id}`); }, onError: (e) => toast.error(rawMessage(e)) });
  return <Dialog open={aberto} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Novo lote</DialogTitle></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Centro destino *</Label><Select value={centro} onValueChange={setCentro}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{centrosQ.data?.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Data do inventário *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Observação</Label><Input value={observacao} onChange={(e) => setObservacao(e.target.value)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Colar inventário</Label><Textarea className="min-h-40 font-mono text-xs" placeholder={'SKU\tquantidade'} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <p className="text-xs text-muted-foreground">{previa.itens.length} SKUs · {pecas.toLocaleString("pt-BR")} peças</p>
        {previa.invalidas.length > 0 && <div className="text-xs text-destructive">{previa.invalidas.map((l) => <div key={l}>{l}</div>)}</div>}
      </div></div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => criar.mutate()} disabled={criar.isPending}>{criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lote</Button></DialogFooter>
  </DialogContent></Dialog>;
}
