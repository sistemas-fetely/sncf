import { Fragment, useState } from "react";
import { useReposicaoSp } from "@/hooks/estoque/useReposicaoSp";
import { linhasReposicao, totaisReposicao, type AbaReposicao, type CargaReposicao } from "@/lib/estoque/reposicaoSp";
import { agruparReposicao, checkboxReposicao, estadoSelecao, filtrarReposicao, itensSelecionadosReposicao, marcarReposicao, ordenarReposicao, semCategoria, type LinhaReposicaoTabela, type SelecaoReposicao } from "@/lib/estoque/reposicaoSpTabela";
import { useEstadoTela, lerLista, escreverLista, lerOrdemKD, escreverOrdemKD } from "@/lib/navegacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodProduto } from "@/components/produto/CodProduto";
import { FiltroMultiSelect } from "@/components/financeiro/FiltroMultiSelect";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { formatError } from "@/lib/format-error";

const colunas = [
  ["cod_cadastro", "Código"], ["nome_comercial", "Produto"], ["colecao", "Coleção"], ["classe", "Classe"],
  ["inner_kits", "Inner"], ["minimo", "Mín/Teto"], ["disp_sp", "SP"], ["em_transito", "Trânsito"],
  ["disp_sr", "Show Room"], ["posicao", "Posição"], ["disp_origem", "XPM"], ["situacao", "Situação"], ["quantidade", "Qtd sugerida"],
];
const situacoes: Record<string, string> = { dispara: "Dispara", carona: "Carona", ok: "OK", sem_origem: "Sem origem" };

export function PainelReposicaoSp({ aba, onAba, onUsar, rotulo = "Nova transferência" }: { aba: AbaReposicao; onAba: (aba: AbaReposicao) => void; onUsar: (carga: CargaReposicao) => void; rotulo?: string }) {
  const q = useReposicaoSp();
  const [nav, setNav] = useEstadoTela({ busca: "", colecoes: "", familias: "", grupos: "", classes: "", situacoes: "", ordem: "nenhum", agrupar: false, mostrar: false }, { prefixo: "repor", replaceKeys: ["busca"] });
  const [selecao, setSelecao] = useState<SelecaoReposicao>({});
  const linhas = linhasReposicao(q.data ?? [], aba) as LinhaReposicaoTabela[];
  const ordem = lerOrdemKD(nav.ordem);
  const filtradas = filtrarReposicao(linhas, { busca: nav.busca, colecoes: lerLista(nav.colecoes), familias: lerLista(nav.familias), grupos: lerLista(nav.grupos), classes: lerLista(nav.classes), situacoes: lerLista(nav.situacoes) });
  const itens = itensSelecionadosReposicao(linhas, selecao);
  const total = totaisReposicao(itens, q.data ?? []);
  const skusFiltrados = new Set(filtradas.map(l => l.sku));
  const escondidos = itens.filter(i => !skusFiltrados.has(i.sku));
  const skusSelecionados = new Set(itens.map(i => i.sku));
  const visiveis = ordenarReposicao(nav.mostrar ? linhas.filter(l => skusSelecionados.has(l.sku)) : filtradas, ordem, selecao);
  const grupos = nav.agrupar ? agruparReposicao(visiveis) : [{ nome: "", produtos: visiveis, unidades: 0 }];
  const marcar = (produtos: LinhaReposicaoTabela[], v: boolean) => setSelecao(s => marcarReposicao(s, produtos, v));
  function ordenar(key: string) {
    setNav({ ordem: escreverOrdemKD(ordem?.key === key ? (ordem.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }) });
  }
  function linha(l: LinhaReposicaoTabela) {
    const s = estadoSelecao(l, selecao);
    return <tr key={l.sku} className="border-t hover:bg-muted/40">
      <td className="p-2"><CodProduto chave={l.sku} variant="compacto" /></td>
      <td className="p-2 min-w-40">{l.nome_comercial}</td><td className="p-2 whitespace-nowrap">{l.colecao || "Sem coleção"}</td>
      <td className="p-2 whitespace-nowrap">{l.classe_rotulo ?? l.classe}</td>
      {[l.inner_kits, `${l.minimo ?? "—"}/${l.teto ?? "—"}`, l.disp_sp, l.em_transito].map((v, i) => <td key={i} className="p-2 text-right tabular-nums">{v ?? "—"}</td>)}
      <td className="p-2 text-right tabular-nums whitespace-nowrap">{l.disp_sr ?? "—"}{Number(l.sr_pedido) > 0 && <Badge variant="outline" className="ml-1">pede {l.sr_pedido}</Badge>}</td>
      <td className="p-2 text-right tabular-nums">{l.posicao}</td><td className="p-2 text-right tabular-nums">{l.disp_origem}</td>
      <td className="p-2"><Badge variant={l.situacao === "dispara" ? "destructive" : "secondary"}>{situacoes[l.situacao ?? ""] ?? l.situacao}</Badge></td>
      <td className="p-2"><Input className="h-8 w-24 text-right tabular-nums" type="number" min={0} step={1} aria-label={`Kits de ${l.sku}`} value={s.qtd} onChange={e => setSelecao(p => ({ ...p, [l.sku]: { ...estadoSelecao(l, p), qtd: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))} /></td>
      <td className="p-2"><Checkbox aria-label={`Selecionar ${l.sku}`} checked={s.marcado} onCheckedChange={v => marcar([l], v === true)} /></td>
    </tr>;
  }
  return <section className="space-y-3 min-w-0">
    <h2 className="text-lg font-semibold">Repor SP</h2>
    <Tabs value={aba} onValueChange={v => { onAba(v as AbaReposicao); setNav({ mostrar: false }); }}><TabsList><TabsTrigger value="urgente">Urgente hoje</TabsTrigger><TabsTrigger value="carga">Carga da semana</TabsTrigger></TabsList></Tabs>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-9 w-full sm:w-64" placeholder="Buscar código ou nome" aria-label="Buscar produtos para repor SP" value={nav.busca} onChange={e => setNav({ busca: e.target.value, mostrar: false })} />
      {([ ["colecoes", "Coleção", "colecao"], ["familias", "Família", "familia"], ["grupos", "Grupo", "grupo"], ["classes", "Classe", "classe"], ["situacoes", "Situação", "situacao"] ] as const).map(([chave, label, campo]) => <FiltroMultiSelect key={chave} label={label} opcoes={[...new Set(linhas.map(l => l[campo] || semCategoria))].sort((a, b) => a.localeCompare(b, "pt-BR"))} selecionados={lerLista(nav[chave])} onChange={v => setNav({ [chave]: escreverLista(v), mostrar: false })} rotulo={v => v === semCategoria ? `Sem ${label.toLocaleLowerCase("pt-BR")}` : campo === "classe" ? linhas.find(l => l.classe === v)?.classe_rotulo ?? v : campo === "situacao" ? situacoes[v] ?? v : v} />)}
      <span className="text-xs text-muted-foreground tabular-nums">{visiveis.length} de {linhas.length} produtos</span>
      <label className="flex items-center gap-2 text-sm sm:ml-auto"><Switch checked={nav.agrupar} onCheckedChange={v => setNav({ agrupar: v })} aria-label="Agrupar por coleção" />Agrupar por coleção</label>
    </div>
    {nav.mostrar && <div className="flex items-center gap-2 text-sm"><span>Todos os selecionados</span><Button variant="link" size="sm" onClick={() => setNav({ mostrar: false })}>Voltar ao filtro</Button></div>}
    {q.error ? <p role="alert" className="text-destructive">{formatError(q.error)}</p> : <div className="rounded-md border bg-card overflow-auto max-h-[60vh] [--fila-topo-colado:0px]">
      <table className="w-full text-xs"><thead><tr className={LINHA_CABECALHO_COLADO}>{colunas.map(([key, label]) => <CabecalhoOrdenavel key={key} rotulo={label} dir={ordem?.key === key ? ordem.dir : null} onOrdenar={() => ordenar(key)} className="p-2 h-10 whitespace-nowrap" alinharDireita={!["cod_cadastro", "nome_comercial", "colecao", "classe", "situacao"].includes(key)} />)}<th className="p-2"><Checkbox aria-label="Selecionar todos do filtro" disabled={!visiveis.length} checked={checkboxReposicao(visiveis, selecao)} onCheckedChange={v => marcar(visiveis, v === true)} /></th></tr></thead>
        <tbody>{grupos.map(g => <Fragment key={g.nome}>{nav.agrupar && <tr className="border-t bg-muted/50"><td colSpan={14} className="p-2"><div className="flex items-center gap-2"><Checkbox aria-label={`Selecionar coleção ${g.nome}`} checked={checkboxReposicao(g.produtos, selecao)} onCheckedChange={v => marcar(g.produtos, v === true)} /><span className="font-semibold">{g.nome}</span><span className="text-muted-foreground tabular-nums">· {g.produtos.length} produtos · {g.unidades} un sugeridas</span></div></td></tr>}{g.produtos.map(linha)}</Fragment>)}{!visiveis.length && <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum produto."}</td></tr>}</tbody>
      </table>
    </div>}
    <footer className="flex flex-wrap justify-between items-center gap-3 border-t bg-background py-3">
      <div className="text-sm tabular-nums"><span>{total.skus} selecionados · {total.kits} un</span>{escondidos.length > 0 && <span> ({escondidos.length} fora do filtro) <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setNav({ mostrar: true })}>mostrar</Button></span>}<div className="text-xs text-muted-foreground">{total.kits} kits · {total.pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg estimados{total.semPeso > 0 && <span className="text-warning"> · {total.semPeso} sem peso</span>}</div></div>
      <Button type="button" className="whitespace-normal h-auto min-h-10 text-center" disabled={!itens.length || !!q.error} onClick={() => onUsar({ itens, aba })}>{rotulo} — todos os {itens.length} selecionados</Button>
    </footer>
  </section>;
}
