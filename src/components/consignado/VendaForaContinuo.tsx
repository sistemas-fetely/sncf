import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CodProduto } from "@/components/produto/CodProduto";
import { Loader2 } from "lucide-react";
import { useEstadoTela } from "@/lib/navegacao";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { fmtData, hojeISO } from "@/lib/data";
import { cn } from "@/lib/utils";
import { filtrarEstoqueVendaFora, resumirVendaFora, type EstoqueVendaFora } from "@/lib/consignado/vendaForaContinuo";
import { useVendaForaCompetencia, useVendaForaRecebiveis } from "./VendaForaVistas";
const sb = supabase as any;
function useEstoque(parceiroId: string) {
  return useQuery({ queryKey: ["vw_venda_fora_estoque", parceiroId], queryFn: async () => {
    const { data, error } = await sb.from("vw_venda_fora_estoque").select("*").eq("parceiro_id", parceiroId).order("sku");
    if (error) throw error;
    return (data ?? []) as EstoqueVendaFora[];
  }});
}
function Erro({ error }: { error: unknown }) { return <Alert variant="destructive"><AlertDescription>{formatError(error)}</AlertDescription></Alert>; }
function Carregando() { return <Loader2 className="m-6 h-5 w-5 animate-spin" />; }
export function ResumoVendaFora({ parceiroId }: { parceiroId: string }) {
  const estoque = useEstoque(parceiroId), competencias = useVendaForaCompetencia(parceiroId), recebiveis = useVendaForaRecebiveis(parceiroId);
  const error = estoque.error ?? competencias.error ?? recebiveis.error;
  if (error) return <Erro error={error} />;
  if (estoque.isLoading || competencias.isLoading || recebiveis.isLoading) return <Carregando />;
  const r = resumirVendaFora(estoque.data ?? [], competencias.data ?? [], recebiveis.data ?? [], hojeISO());
  const cards = [
    { titulo: "Estoque na Casa 22", valor: formatBRL(r.custo), detalhe: `${r.unidades.toLocaleString("pt-BR")} unidades` },
    { titulo: "Vendido no mês", valor: formatBRL(r.mes?.receita_bruta ?? 0), detalhe: `${Number(r.mes?.unidades ?? 0).toLocaleString("pt-BR")} unidades` },
    { titulo: "A receber da plataforma", valor: formatBRL(r.receber) },
    { titulo: "Aluguel a pagar", valor: formatBRL(r.aluguel?.aluguel_a_pagar ?? 0), detalhe: r.aluguel ? `${fmtData(r.aluguel.aluguel_vencimento)} · ${r.aluguel.aluguel_status}` : "Sem aluguel aberto" },
    { titulo: "Divergência de estoque", valor: `${r.divergencias} SKUs`, alerta: r.divergencias > 0 },
  ];
  return <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">{cards.map(c => <Card key={c.titulo}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{c.titulo}</p><p className={cn("mt-1 break-words text-2xl font-medium tabular-nums", c.alerta && "text-destructive")}>{c.valor}</p>{c.detalhe && <p className="mt-1 text-xs text-muted-foreground">{c.detalhe}</p>}</CardContent></Card>)}</div>;
}
export function EstoqueVendaForaTabela({ parceiroId }: { parceiroId: string }) {
  const q = useEstoque(parceiroId);
  const [estado, setEstado] = useEstadoTela({ busca: "", divergencias: false }, { prefixo: "vf", replaceKeys: ["busca"] });
  const rows = q.data ?? [];
  const filtrados = filtrarEstoqueVendaFora(rows, estado.busca, estado.divergencias);
  const total = (campo: "qtd_sncf" | "qtd_plataforma" | "valor_custo_sncf") => rows.reduce((s, r) => s + Number(r[campo] ?? 0), 0);
  const foto = rows.map(r => r.data_foto_plataforma).filter((d): d is string => !!d).sort().at(-1);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl">Estoque no parceiro</h2><p className="text-sm text-muted-foreground">SNCF: {total("qtd_sncf").toLocaleString("pt-BR")} · Plataforma: {total("qtd_plataforma").toLocaleString("pt-BR")} · Custo: {formatBRL(total("valor_custo_sncf"))}</p><p className="text-xs text-muted-foreground">Foto da plataforma {foto ? `de ${fmtData(foto).slice(0, 5)}` : "—"}</p></div>
    <div className="flex flex-wrap items-center gap-4"><Input className="w-64 max-w-full" aria-label="Buscar SKU, produto ou EAN" placeholder="Buscar SKU, produto ou EAN" value={estado.busca} onChange={e => setEstado({ busca: e.target.value })} /><div className="flex items-center gap-2"><Switch id="vf-divergencias" checked={estado.divergencias} onCheckedChange={v => setEstado({ divergencias: v })} /><Label htmlFor="vf-divergencias">Só divergências</Label></div></div></div>
    {q.isError ? <Erro error={q.error} /> : q.isLoading ? <Carregando /> : <div className="overflow-x-auto rounded-md border bg-card"><TooltipProvider><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>EAN</TableHead><TableHead className="text-right">SNCF</TableHead><TableHead className="text-right">Plataforma</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead className="text-right">Custo</TableHead></TableRow></TableHeader><TableBody>{filtrados.map(r => <TableRow key={r.sku}><TableCell><CodProduto chave={r.sku} variant="compacto" /></TableCell><TableCell>{r.produto}</TableCell><TableCell className="font-mono text-xs">{r.ean ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{r.qtd_sncf}</TableCell><TableCell className="text-right tabular-nums"><Tooltip><TooltipTrigger tabIndex={0} className="underline decoration-dotted">{r.qtd_plataforma ?? "—"}</TooltipTrigger><TooltipContent>Loja: {r.qtd_plataforma_loja ?? "—"} · Trânsito: {r.qtd_plataforma_transito ?? "—"}</TooltipContent></Tooltip></TableCell><TableCell className={cn("text-right tabular-nums", Number(r.diferenca ?? 0) !== 0 && "font-medium text-destructive")}>{r.diferenca ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(r.valor_custo_sncf)}</TableCell></TableRow>)}{!filtrados.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem itens para os filtros atuais.</TableCell></TableRow>}</TableBody></Table></TooltipProvider></div>}
  </section>;
}
export function DocumentosVendaFora({ parceiroId }: { parceiroId: string }) {
  const q = useQuery({ queryKey: ["vw_venda_fora_documento", parceiroId], queryFn: async () => {
    const { data, error } = await sb.from("vw_venda_fora_documento").select("*").eq("parceiro_id", parceiroId).order("data", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  }});
  const nomes: Record<string, string> = { remessa: "Remessa 5904", retorno: "Retorno 1904", venda: "Venda série 2" };
  return <section className="space-y-3"><h2 className="font-display text-xl">Movimento por documento</h2>{q.isError ? <Erro error={q.error} /> : q.isLoading ? <Carregando /> : <div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>NF nº/série</TableHead><TableHead>CFOP</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Valor da nota</TableHead></TableRow></TableHeader><TableBody>{(q.data ?? []).map((r, i) => <TableRow key={`${r.referencia}-${i}`}><TableCell>{fmtData(r.data)}</TableCell><TableCell><Badge variant="outline">{nomes[r.tipo] ?? r.tipo}</Badge></TableCell><TableCell>{r.doc_numero ?? "—"} / {r.serie ?? "—"}</TableCell><TableCell>{r.cfop ?? "—"}</TableCell><TableCell className="text-right">{r.skus}</TableCell><TableCell className={cn("text-right tabular-nums", Number(r.unidades) > 0 ? "text-success" : Number(r.unidades) < 0 ? "text-destructive" : "")}>{Number(r.unidades) > 0 ? "+ " : Number(r.unidades) < 0 ? "− " : ""}{Math.abs(Number(r.unidades ?? 0)).toLocaleString("pt-BR")}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(r.valor_nota)}</TableCell></TableRow>)}{!q.data?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum documento encontrado.</TableCell></TableRow>}</TableBody><TableFooter><TableRow><TableCell colSpan={5}>Saldo de unidades</TableCell><TableCell className="text-right tabular-nums">{(q.data ?? []).reduce((s, r) => s + Number(r.unidades ?? 0), 0).toLocaleString("pt-BR")}</TableCell><TableCell /></TableRow></TableFooter></Table></div>}</section>;
}
