import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { RefreshCw, Download, Check, X, ChevronDown, ChevronRight, ChevronLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { useEstadoTela } from "@/lib/navegacao/useEstadoTela";
import { useCatalogoLeitura } from "@/hooks/useCatalogoLeitura";
import { agruparCatalogo, completarNomesCatalogo, valorSistemaVazio, CAMPOS_OPERACOES, celulasSelecionadas, decisoesCatalogo, type CelulaCatalogo, type DecisaoCatalogo, type EscolhasCatalogo } from "@/lib/acervo/revisaoCatalogo";

const texto = (v: unknown) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const TAMANHO_PAGINA = 25;
type Previa = { grupos: DecisaoCatalogo[]; celulas: CelulaCatalogo[] };

export function AtualizacaoCatalogoDia() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useEstadoTela({ campo: 'todos', tipo: 'todos', busca: '', pagina: 1 }, { prefixo: 'catalogo', replaceKeys: ['busca'] });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [escolhas, setEscolhas] = useState<EscolhasCatalogo>({});
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [semCadastroAberto, setSemCadastroAberto] = useState(false);
  const [errosAberto, setErrosAberto] = useState(false);
  const { ultima, referencia, lista } = useCatalogoLeitura();
  const matriz = useQuery({ queryKey: ['catalogo-planilha-rotulos'], queryFn: async () => {
    const r = await supabase.from('produto_ficha_nascimento').select('campo,rotulo,ordem').in('campo', CAMPOS_OPERACOES).order('ordem');
    if (r.error) throw r.error;
    if (!r.data || CAMPOS_OPERACOES.some(c => !r.data.some(m => m.campo === c && m.rotulo))) throw new Error('A matriz de campos está sem rótulo de Operações.');
    return r.data;
  } });
  const nomes = useQuery({ queryKey: ['catalogo-planilha-nomes', referencia.data?.id], enabled: !!lista.data, queryFn: async () => {
    const codigos = [...new Set((lista.data ?? []).filter(m => m.dono === 'operacoes' && m.tipo !== 'sem_cadastro').map(m => m.cod_cadastro))];
    const out: Record<string, string> = {};
    for (let de = 0; de < codigos.length; de += 200) {
      const r = await supabase.from('sncf_produtos').select('cod_cadastro,nome_comercial').in('cod_cadastro', codigos.slice(de, de + 200));
      if (r.error) throw r.error;
      for (const p of r.data ?? []) if (p.cod_cadastro) out[p.cod_cadastro] = p.nome_comercial ?? '';
    }
    const semNome = codigos.filter(c => !out[c]?.trim());
    const celulasNome: Pick<CelulaCatalogo, 'cod_cadastro' | 'campo' | 'valor_planilha'>[] = [];
    for (let de = 0; de < semNome.length; de += 200) {
      const r = await supabase.from('catalogo_planilha_mudanca').select('cod_cadastro,campo,valor_planilha').eq('leitura_id', referencia.data?.id ?? '').eq('campo', 'nome_comercial').in('cod_cadastro', semNome.slice(de, de + 200));
      if (r.error) throw r.error;
      celulasNome.push(...(r.data ?? []));
    }
    return completarNomesCatalogo(out, celulasNome);
  } });
  useEffect(() => { setSelecionados(new Set()); setEscolhas({}); setPrevia(null); }, [referencia.data?.id]);
  const ler = useMutation({ mutationFn: async () => {
    const r = await supabase.functions.invoke('catalogo-planilha-ler', { body: { acao: 'ler' } });
    if (r.error) throw new Error(r.error instanceof FunctionsHttpError ? await r.error.context.text() : r.error.message);
    if (!r.data?.ok) throw new Error(r.data?.erro); return r.data;
  }, onSuccess: async r => { toast.success(r.status === 'sem_mudanca' ? 'Planilha sem mudança.' : 'Leitura comparada.'); await qc.invalidateQueries({ queryKey: ['catalogo-planilha-ultima'] }); }, onError: e => toast.error(formatError(e)) });
  const resolver = useMutation({ mutationFn: async (p: Previa) => {
    let feitas = 0;
    for (const d of p.grupos) {
      const r = await supabase.rpc('fn_catalogo_resolver', { p_ids: d.ids, p_acao: d.acao, p_escolha: d.escolha });
      if (r.error) throw r.error;
      const data = r.data as { ok: boolean; feitas: number; resultados: { ok: boolean; erro?: string }[] };
      if (!data.ok) throw new Error(data.resultados.filter(x => !x.ok).map(x => x.erro).join('; '));
      feitas += data.feitas;
    }
    return feitas;
  }, onSuccess: async feitas => { toast.success(`${feitas} células atualizadas.`); setPrevia(null); setSelecionados(new Set()); setEscolhas({}); await qc.invalidateQueries(); }, onError: async e => { toast.error(formatError(e)); await qc.invalidateQueries(); } });
  const copiar = async () => {
    const path = ultima.data?.storage_path; if (!path) return;
    const r = await supabase.storage.from('catalogo-planilha').createSignedUrl(path, 300);
    if (r.error) { toast.error(r.error.message); return; }
    window.open(r.data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  const rotulos = Object.fromEntries((matriz.data ?? []).map(m => [m.campo, m.rotulo]));
  const produtos = agruparCatalogo(lista.data ?? [], nomes.data ?? {}, filtro);
  const selecionadas = celulasSelecionadas(produtos, selecionados);
  const aplicacoes = decisoesCatalogo(selecionadas, 'aplicar', escolhas);
  const descartes = decisoesCatalogo(selecionadas, 'descartar', escolhas);
  const semCadastro = [...new Set((lista.data ?? []).filter(m => m.tipo === 'sem_cadastro').map(m => m.cod_cadastro))].sort();
  const erros = (lista.data ?? []).filter(m => m.dono === 'operacoes' && m.tipo === 'erro');
  const totais = (ultima.data?.totais ?? {}) as Record<string, unknown>;
  const paginas = Math.max(1, Math.ceil(produtos.length / TAMANHO_PAGINA));
  const pagina = Math.max(1, Math.min(filtro.pagina, paginas));
  const visiveis = produtos.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA);
  const elegiveis = produtos.filter(p => p.celulas.some(c => ['mudanca', 'conflito'].includes(c.tipo)));
  const todos = elegiveis.length > 0 && elegiveis.every(p => selecionados.has(p.codigo));
  const alguns = elegiveis.some(p => selecionados.has(p.codigo));
  const carregando = lista.isLoading || referencia.isLoading || matriz.isLoading || nomes.isLoading;
  const falhas = [ultima.error, referencia.error, lista.error, matriz.error, nomes.error, ultima.data?.erro].filter(Boolean);
  const abrirPrevia = (grupos: DecisaoCatalogo[]) => setPrevia({ grupos, celulas: selecionadas });

  return <section className="space-y-4 border-y py-4" id="atualizacao-do-dia">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1"><h2 className="text-lg font-semibold">Atualização do dia · Operações</h2>
        {ultima.data && <p className="text-sm font-medium">{texto(totais.mudanca ?? 0)} mudanças · <span className="text-warning">{texto(totais.conflito ?? 0)} conflitos</span> · <span className="text-destructive">{texto(totais.erro ?? 0)} erros</span> · {texto(totais.sem_cadastro ?? 0)} sem cadastro</p>}
        <p className="text-xs text-muted-foreground">{ultima.isLoading ? 'Lendo…' : ultima.data ? `${ultima.data.status.replace(/_/g, ' ')} · ${fmtDataHora(ultima.data.lida_em)}` : 'Nenhuma leitura.'}</p>
        {referencia.data && ultima.data?.id !== referencia.data.id && <p className="text-xs text-muted-foreground">Pendências da leitura de {fmtDataHora(referencia.data.lida_em)}</p>}
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void copiar()} disabled={!ultima.data?.storage_path}><Download className="mr-2 h-4 w-4" />Cópia da planilha</Button><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Ler catálogo" size="sm" disabled={ler.isPending} onClick={() => ler.mutate()}><RefreshCw className="mr-2 h-4 w-4" />Ler agora</BotaoGuardado></div>
    </div>
    {falhas.map((e, i) => <Alert key={i} variant="destructive"><AlertDescription>{formatError(e)}</AlertDescription></Alert>)}
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar código ou nome" placeholder="Código ou nome comercial" className="pl-9" value={filtro.busca} onChange={e => setFiltro({ busca: e.target.value, pagina: 1 })} /></div>
      <Select value={filtro.campo} onValueChange={campo => setFiltro({ campo, pagina: 1 })}><SelectTrigger className="w-48" aria-label="Filtrar por campo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os campos</SelectItem>{(matriz.data ?? []).map(m => <SelectItem key={m.campo} value={m.campo}>{m.rotulo}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.tipo} onValueChange={tipo => setFiltro({ tipo, pagina: 1 })}><SelectTrigger className="w-40" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem><SelectItem value="mudanca">Mudança</SelectItem><SelectItem value="conflito">Conflito</SelectItem><SelectItem value="erro">Erro</SelectItem></SelectContent></Select>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Selecionar todos do filtro" checked={todos ? true : alguns ? 'indeterminate' : false} disabled={!elegiveis.length || resolver.isPending} onCheckedChange={v => setSelecionados(old => { const n = new Set(old); for (const p of elegiveis) { if (v === true) n.add(p.codigo); else n.delete(p.codigo); } return n; })} />Selecionar todos do filtro <span className="text-muted-foreground">({elegiveis.length} produtos)</span></label>
      <div className="flex gap-2"><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Aplicar catálogo" size="sm" disabled={!aplicacoes.length || resolver.isPending} onClick={() => abrirPrevia(aplicacoes)}><Check className="mr-2 h-4 w-4" />Aplicar ({selecionadas.length})</BotaoGuardado><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Descartar catálogo" variant="outline" size="sm" disabled={!descartes.length || resolver.isPending} onClick={() => abrirPrevia(descartes)}><X className="mr-2 h-4 w-4" />Descartar ({selecionadas.length})</BotaoGuardado></div>
    </div>
    {selecionadas.some(c => c.tipo === 'conflito' && !escolhas[c.id]) && <p className="text-sm text-warning">Há conflitos selecionados sem escolha de planilha ou sistema.</p>}
    <div className="max-h-[36rem] overflow-auto rounded-md border bg-card card-shadow"><Table className="min-w-[1000px]"><TableHeader className="sticky top-0 z-10 bg-muted"><TableRow><TableHead className="w-10" /><TableHead className="w-64">Produto</TableHead>{(matriz.data ?? []).map(m => <TableHead key={m.campo} className="min-w-40">{m.rotulo}</TableHead>)}</TableRow></TableHeader><TableBody>
      {!falhas.length && !carregando && visiveis.map(p => <TableRow key={p.codigo} className="bg-card hover:bg-muted/50"><TableCell className="align-top"><Checkbox aria-label={`Selecionar produto ${p.codigo}`} checked={selecionados.has(p.codigo)} disabled={!p.celulas.some(c => ['mudanca', 'conflito'].includes(c.tipo)) || resolver.isPending} onCheckedChange={v => setSelecionados(old => { const n = new Set(old); if (v === true) n.add(p.codigo); else n.delete(p.codigo); return n; })} /></TableCell><TableCell className="align-top"><p className="font-mono text-sm font-semibold">{p.codigo}</p><p className="mt-1 text-sm">{p.nome || 'Nome comercial não informado'}</p></TableCell>{(matriz.data ?? []).map(m => {
        const c = p.celulas.find(c => c.campo === m.campo);
        return <TableCell key={m.campo} className={`align-top ${c?.tipo === 'conflito' ? 'bg-warning/10' : c?.tipo === 'erro' ? 'bg-destructive/10' : ''}`}>
          {!c ? <span className="text-muted-foreground">—</span> : c.tipo === 'erro' ? <div className="space-y-1 text-sm text-destructive"><p className="font-medium">Erro</p><p>{c.erro}</p><p className="break-words">Planilha: {texto(c.valor_planilha)}</p></div> : c.tipo === 'conflito' ? <div className="space-y-2 text-xs"><p className="font-semibold text-warning">Conflito</p><div className="space-y-1 break-words"><p><span className="text-muted-foreground">Base:</span> {texto(c.valor_base)}</p><p><span className="text-muted-foreground">Sistema:</span> {texto(c.valor_sistema)}</p><p><span className="text-muted-foreground">Planilha:</span> {texto(c.valor_planilha)}</p></div><RadioGroup aria-label={`Escolha para ${p.codigo} ${m.rotulo}`} value={escolhas[c.id] ?? ''} disabled={resolver.isPending} onValueChange={v => { if (v === 'planilha' || v === 'sistema') setEscolhas(old => ({ ...old, [c.id]: v })); }} className="flex flex-wrap gap-3">{(['planilha', 'sistema'] as const).map(v => <label key={v} className="flex items-center gap-1"><RadioGroupItem value={v} />{v === 'planilha' ? 'Planilha' : 'Sistema'}</label>)}</RadioGroup></div> : <div className="flex flex-wrap items-baseline gap-1 text-sm break-words">{valorSistemaVazio(c.valor_sistema) ? <span className="text-muted-foreground">novo:</span> : <><span className="text-muted-foreground">{texto(c.valor_sistema)}</span><span className="text-muted-foreground">→</span></>}<span className="font-medium">{texto(c.valor_planilha)}</span></div>}
        </TableCell>;
      })}</TableRow>)}
      {(carregando || !visiveis.length || !!falhas.length) && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{falhas.length ? 'Não foi possível carregar a revisão.' : carregando ? 'Carregando produtos…' : 'Nenhuma pendência neste filtro.'}</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{produtos.length} produtos · {produtos.reduce((n, p) => n + p.celulas.length, 0)} células pendentes</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Página anterior do catálogo" disabled={pagina === 1} onClick={() => setFiltro({ pagina: pagina - 1 })}><ChevronLeft className="h-4 w-4" /></Button><span>Página {pagina} de {paginas}</span><Button variant="outline" size="icon" aria-label="Próxima página do catálogo" disabled={pagina === paginas} onClick={() => setFiltro({ pagina: pagina + 1 })}><ChevronRight className="h-4 w-4" /></Button></div></div>
    {!!semCadastro.length && <div className="border-t pt-2"><div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="sm" aria-expanded={semCadastroAberto} onClick={() => setSemCadastroAberto(v => !v)}>{semCadastroAberto ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}{semCadastro.length} códigos sem cadastro ({semCadastro[0]}–{semCadastro[semCadastro.length - 1]})</Button><Link className="text-sm text-primary underline" to="/vendas/produto/chegada-mercadoria?aba=cadastro-pi">→ Importação de PI</Link></div>{semCadastroAberto && <div className="max-h-48 overflow-auto p-3 font-mono text-sm text-muted-foreground">{semCadastro.join(' · ')}</div>}</div>}
    {!!erros.length && <div className="border-t pt-2"><Button variant="ghost" size="sm" className="text-destructive" aria-expanded={errosAberto} onClick={() => setErrosAberto(v => !v)}>{errosAberto ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}{erros.length} erros</Button>{errosAberto && <div className="max-h-48 overflow-auto space-y-2 p-3 text-sm">{erros.map(c => <p key={c.id}><strong>{c.cod_cadastro}</strong> · {rotulos[c.campo] ?? 'Campo não identificado na matriz'} · <span className="text-destructive">{c.erro}</span></p>)}</div>}</div>}
    <Dialog open={!!previa} onOpenChange={o => { if (!o && !resolver.isPending) setPrevia(null); }}><DialogContent><DialogHeader><DialogTitle>Confirmar {previa?.grupos[0]?.acao === 'descartar' ? 'descarte' : 'aplicação'} · {previa?.celulas.length} células</DialogTitle></DialogHeader><div className="max-h-80 overflow-auto text-sm">{previa?.celulas.map(c => { const d = previa.grupos.find(d => d.ids.includes(c.id)); return <p key={c.id} className="border-b py-2">{c.cod_cadastro} · {rotulos[c.campo] ?? 'Campo não identificado na matriz'}: {texto(c.valor_sistema)} → {texto(d?.escolha === 'planilha' ? c.valor_planilha : c.valor_sistema)}</p>; })}</div><DialogFooter><Button variant="outline" disabled={resolver.isPending} onClick={() => setPrevia(null)}>Voltar</Button><Button disabled={resolver.isPending} onClick={() => { if (previa) resolver.mutate(previa); }}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
