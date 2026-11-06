import { useState } from "react";
import { useReposicaoSp } from "@/hooks/estoque/useReposicaoSp";
import { linhasReposicao, totaisReposicao, type AbaReposicao, type CargaReposicao } from "@/lib/estoque/reposicaoSp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodProduto } from "@/components/produto/CodProduto";
import { formatError } from "@/lib/format-error";

export function PainelReposicaoSp({ aba, onAba, onUsar, rotulo = "Criar transferência" }: { aba: AbaReposicao; onAba: (aba: AbaReposicao) => void; onUsar: (carga: CargaReposicao) => void; rotulo?: string }) {
  const q = useReposicaoSp();
  const [selecao, setSelecao] = useState<Record<string, { marcado: boolean; qtd: number }>>({});
  const linhas = linhasReposicao(q.data ?? [], aba);
  const sel = (sku: string, qtd: number | null) => selecao[sku] ?? { marcado: true, qtd: qtd ?? 0 };
  const itens = linhas.filter(l => sel(l.sku, l.qtd_sugerida).marcado && sel(l.sku, l.qtd_sugerida).qtd > 0).map(l => ({ sku: l.sku, nome: l.nome_comercial ?? "", quantidade: sel(l.sku, l.qtd_sugerida).qtd }));
  const total = totaisReposicao(itens, q.data ?? []);
  return <section className="space-y-3 min-w-0">
    <h2 className="text-lg font-semibold">Repor SP</h2>
    <Tabs value={aba} onValueChange={v => onAba(v as AbaReposicao)}><TabsList><TabsTrigger value="urgente">Urgente hoje</TabsTrigger><TabsTrigger value="carga">Carga da semana</TabsTrigger></TabsList></Tabs>
    {q.error ? <p role="alert" className="text-destructive">{formatError(q.error)}</p> : <div className="rounded-md border bg-card overflow-auto max-h-[60vh]">
      <table className="w-full text-xs"><thead className="bg-muted sticky top-0 z-10"><tr>{["Código", "Produto", "Classe", "Inner", "Mín/Teto", "SP", "Trânsito", "Show Room", "Posição", "XPM", "Situação", "Qtd sugerida"].map(h => <th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>)}<th className="p-2"><Checkbox aria-label="Selecionar todos" checked={linhas.length > 0 && linhas.every(l => sel(l.sku, l.qtd_sugerida).marcado)} onCheckedChange={v => setSelecao(s => ({ ...s, ...Object.fromEntries(linhas.map(l => [l.sku, { ...sel(l.sku, l.qtd_sugerida), marcado: v === true }])) }))} /></th></tr></thead>
      <tbody>{linhas.map(l => { const s = sel(l.sku, l.qtd_sugerida); return <tr key={l.sku} className="border-t hover:bg-muted/40"><td className="p-2"><CodProduto chave={l.sku} variant="compacto" /></td><td className="p-2 min-w-40">{l.nome_comercial}</td><td className="p-2 whitespace-nowrap">{l.classe_rotulo ?? l.classe}</td>{[l.inner_kits, `${l.minimo ?? "—"}/${l.teto ?? "—"}`, l.disp_sp, l.em_transito].map((v, i) => <td key={i} className="p-2 text-right tabular-nums">{v ?? "—"}</td>)}<td className="p-2 text-right tabular-nums whitespace-nowrap">{l.disp_sr ?? "—"}{Number(l.sr_pedido) > 0 && <Badge variant="outline" className="ml-1">pede {l.sr_pedido}</Badge>}</td><td className="p-2 text-right tabular-nums">{l.posicao}</td><td className="p-2 text-right tabular-nums">{l.disp_origem}</td><td className="p-2"><Badge variant={l.situacao === "dispara" ? "destructive" : "secondary"}>{({ dispara: "Dispara", carona: "Carona", ok: "OK", sem_origem: "Sem origem" } as Record<string, string>)[l.situacao ?? ""] ?? l.situacao}</Badge></td><td className="p-2"><Input className="h-8 w-24 text-right tabular-nums" type="number" min={0} step={1} aria-label={`Kits de ${l.sku}`} value={s.qtd} onChange={e => setSelecao(p => ({ ...p, [l.sku]: { ...s, qtd: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))} /></td><td className="p-2"><Checkbox aria-label={`Selecionar ${l.sku}`} checked={s.marcado} onCheckedChange={v => setSelecao(p => ({ ...p, [l.sku]: { ...s, marcado: v === true } }))} /></td></tr>; })}{!linhas.length && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum produto."}</td></tr>}</tbody></table>
    </div>}
    <footer className="flex flex-wrap justify-between gap-3 border-t bg-background py-3"><div className="text-sm tabular-nums">{total.skus} SKUs · {total.kits} kits · {total.pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg estimados{total.semPeso > 0 && <span className="text-warning"> · {total.semPeso} sem peso</span>}</div><Button type="button" disabled={!itens.length || !!q.error} onClick={() => onUsar({ itens, aba })}>{rotulo}</Button></footer>
  </section>;
}