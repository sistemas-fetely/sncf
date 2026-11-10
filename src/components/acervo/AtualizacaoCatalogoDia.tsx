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
import { FiltroMultiSelect } from "@/components/financeiro/FiltroMultiSelect";
import { filtrarCelulas, contarOpcoes, celulaSelecionavel, resumoSelecao, naturezaCelula, listaFiltro, juntarFiltro, type InfoProdutoCatalogo, type DimensaoCatalogo, agruparCatalogo, completarNomesCatalogo, valorSistemaVazio, planoCatalogo, totaisPorBloco, type CelulaCatalogo, type EscolhasCatalogo, type PlanoCatalogo } from "@/lib/acervo/revisaoCatalogo";
import { legivel, posicaoBloco } from "@/lib/acervo/blocosFicha";
import { detectarColecoesNovas, colecaoNaoCadastrada } from '@/lib/acervo/colecoesCatalogo';
import { ColecoesNovasCatalogo } from './ColecoesNovasCatalogo';

const texto = (v: unknown) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const TAMANHO_PAGINA = 25;
type Previa = { acao: 'aplicar' | 'descartar'; plano: PlanoCatalogo; celulas: CelulaCatalogo[] };

export function AtualizacaoCatalogoDia() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useEstadoTela({ bloco: 'todos', dono: 'todos', natureza: 'todos', fase: 'todos', colecoes: '', linhas: '', campo: 'todos', tipo: 'todos', busca: '', pagina: 1 }, { prefixo: 'catalogo', replaceKeys: ['busca'] });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [escolhas, setEscolhas] = useState<EscolhasCatalogo>({});
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [semCadastroAberto, setSemCadastroAberto] = useState(false);
  const [errosAberto, setErrosAberto] = useState(false);
  const { ultima, referencia, lista } = useCatalogoLeitura();
  const colecoes = useQuery({ queryKey: ['catalogo-colecoes-dim'], queryFn: async () => {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const r = await supabase.from('produto_colecao_dim').select('codigo,rotulo,variantes,ativo').eq('ativo', true).order('codigo').range(de, de + 999);
      if (r.error) throw r.error;
      out.push(...(r.data ?? []));
      if ((r.data?.length ?? 0) < 1000) break;
    }
    return out;
  } });
  const matriz = useQuery({ queryKey: ['catalogo-planilha-rotulos'], queryFn: async () => {
    const r = await supabase.from('produto_ficha_nascimento').select('campo,rotulo,ordem,bloco').eq('importavel_planilha', true).order('ordem');
    if (r.error) throw r.error;
    return [...(r.data ?? [])].sort((a, b) => posicaoBloco(a.bloco) - posicaoBloco(b.bloco) || a.bloco.localeCompare(b.bloco) || a.ordem - b.ordem);
  } });
  const nomes = useQuery({ queryKey: ['catalogo-planilha-nomes', referencia.data?.id], enabled: !!lista.data, queryFn: async () => {
    const codigos = [...new Set((lista.data ?? []).filter(m => m.tipo !== 'sem_cadastro').map(m => m.cod_cadastro))];
    const out: Record<string, string> = {};
    const info: Record<string, InfoProdutoCatalogo> = {};
    for (let de = 0; de < codigos.length; de += 200) {
      const r = await supabase.from('sncf_produtos').select('cod_cadastro,nome_comercial,colecao,linha,fase').in('cod_cadastro', codigos.slice(de, de + 200));
      if (r.error) throw r.error;
      for (const p of r.data ?? []) if (p.cod_cadastro) { out[p.cod_cadastro] = p.nome_comercial ?? ''; info[p.cod_cadastro] = { colecao: p.colecao, linha: p.linha, fase: p.fase }; }
    }
    const semNome = codigos.filter(c => !out[c]?.trim());
    const celulasNome: Pick<CelulaCatalogo, 'cod_cadastro' | 'campo' | 'valor_planilha'>[] = [];
    for (let de = 0; de < semNome.length; de += 200) {
      const r = await supabase.from('catalogo_planilha_mudanca').select('cod_cadastro,campo,valor_planilha').eq('leitura_id', referencia.data?.id ?? '').eq('campo', 'nome_comercial').in('cod_cadastro', semNome.slice(de, de + 200));
      if (r.error) throw r.error;
      celulasNome.push(...(r.data ?? []));
    }
    return { nomes: completarNomesCatalogo(out, celulasNome), info };
  } });
  useEffect(() => { setSelecionados(new Set()); setEscolhas({}); setPrevia(null); }, [referencia.data?.id]);
  const ler = useMutation({ mutationFn: async () => {
    const r = await supabase.functions.invoke('catalogo-planilha-ler', { body: { acao: 'ler' } });
    if (r.error) throw new Error(r.error instanceof FunctionsHttpError ? await r.error.context.text() : r.error.message);
    if (!r.data?.ok) throw new Error(r.data?.erro); return r.data;
  }, onSuccess: async r => { toast.success(r.status === 'sem_mudanca' ? 'Planilha sem mudança.' : 'Leitura comparada.'); await qc.invalidateQueries({ queryKey: ['catalogo-planilha-ultima'] }); }, onError: e => toast.error(formatError(e)) });
  const resolver = useMutation({ mutationFn: async (p: Previa) => {
    let feitas = 0;
    for (const d of p.plano.sncf) {
      const r = await supabase.rpc('fn_catalogo_resolver', { p_ids: d.ids, p_acao: d.acao, p_escolha: d.escolha, p_dono: d.dono ?? 'operacoes' });
      if (r.error) throw r.error;
      const data = r.data as { ok: boolean; feitas: number; resultados: { ok: boolean; erro?: string }[] };
      if (!data.ok) throw new Error(data.resultados.filter(x => !x.ok).map(x => x.erro).join('; '));
      feitas += data.feitas;
    }
    const fop = { aplicadas: 0, conflitos: 0, erros: 0 };
    if (p.plano.fop.length) {
      const r = await supabase.functions.invoke('catalogo-planilha-aplicar-fop', { body: { leitura_id: referencia.data?.id, ids: p.plano.fop } });
      if (r.error) throw new Error(`${feitas ? `${feitas} células do SNCF já foram atualizadas. ` : ''}${r.error instanceof FunctionsHttpError ? (await r.error.context.json().catch(() => null))?.erro ?? r.error.message : r.error.message}`);
      if (!r.data?.ok) throw new Error(r.data?.erro ?? 'FOP não confirmou a aplicação.');
      Object.assign(fop, r.data);
    }
    return { feitas: feitas + fop.aplicadas, conflitos: fop.conflitos, erros: fop.erros };
  }, onSuccess: async (r, p) => {
    const resto = [r.conflitos && `${r.conflitos} viraram conflito`, r.erros && `${r.erros} com erro do FOP`].filter(Boolean).join(' · ');
    if (resto) toast.warning(`${r.feitas} células atualizadas · ${resto}.`); else toast.success(`${r.feitas} células atualizadas.`);
    setPrevia(null); setSelecionados(old => { const n = new Set(old); for (const c of p.celulas) n.delete(c.id); return n; }); setEscolhas({}); await qc.invalidateQueries();
  }, onError: async e => { toast.error(formatError(e)); await qc.invalidateQueries(); } });
  const copiar = async () => {
    const path = ultima.data?.storage_path; if (!path) return;
    const r = await supabase.storage.from('catalogo-planilha').createSignedUrl(path, 300);
    if (r.error) { toast.error(r.error.message); return; }
    window.open(r.data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  const rotulos = Object.fromEntries((matriz.data ?? []).map(m => [m.campo, m.rotulo]));
  const blocoDe = Object.fromEntries((matriz.data ?? []).map(m => [m.campo, m.bloco]));
  const pendentesTodas = (lista.data ?? []).filter(c => ['operacoes', 'produto'].includes(c.dono) && ['mudanca', 'conflito', 'erro'].includes(c.tipo));
  const camposPendentes = new Set(pendentesTodas.map(c => c.campo));
  const semRotulo = [...camposPendentes].filter(c => !rotulos[c]);
  const ctx = { nomes: nomes.data?.nomes ?? {}, blocoDe, info: nomes.data?.info };
  const recorte = filtrarCelulas(lista.data ?? [], filtro, ctx);
  const camposRecorte = new Set(recorte.map(c => c.campo));
  const colunas = (matriz.data ?? []).filter(m => camposRecorte.has(m.campo));
  const opcoes = (d: DimensaoCatalogo) => contarOpcoes(lista.data ?? [], filtro, ctx, d);
  const cont = (o: Record<string, { produtos: number; celulas: number }>, v: string) => o[v] ? ` (${o[v].produtos} prod · ${o[v].celulas} cél.)` : ' (0)';
  const ordenar = (o: Record<string, unknown>, sel: string[]) => [...new Set([...Object.keys(o), ...sel])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const oColecao = opcoes('colecoes'), oLinha = opcoes('linhas'), oFase = opcoes('fase'), oBloco = opcoes('bloco'), oDono = opcoes('dono'), oNatureza = opcoes('natureza'), oCampo = opcoes('campo'), oTipo = opcoes('tipo');
  const mudancasDono = { operacoes: pendentesTodas.filter(c => c.tipo === 'mudanca' && c.dono === 'operacoes').length, produto: pendentesTodas.filter(c => c.tipo === 'mudanca' && c.dono === 'produto').length };
  const faixas = colunas.reduce<{ bloco: string; n: number }[]>((acc, m) => { const u = acc[acc.length - 1]; if (u?.bloco === m.bloco) u.n++; else acc.push({ bloco: m.bloco, n: 1 }); return acc; }, []);
  const porBloco = totaisPorBloco(pendentesTodas, blocoDe);
  const blocos = [...new Set((matriz.data ?? []).map(m => m.bloco))].filter(b => porBloco[b]);
  const produtos = agruparCatalogo(lista.data ?? [], ctx.nomes, filtro, blocoDe, ctx.info);
  const selecionavel = (c: CelulaCatalogo) => (c.campo !== 'colecao' || !!colecoes.data) && celulaSelecionavel(c, colecoes.data ?? []);
  const novasColecoes = colecoes.data ? detectarColecoesNovas(lista.data ?? [], colecoes.data) : [];
  const selecionadas = (lista.data ?? []).filter(c => selecionados.has(c.id) && selecionavel(c));
  const resumo = resumoSelecao(selecionadas);
  // Both owners go to the FOP; unknown collections wait for human registration.
  const aplicacoes = planoCatalogo(selecionadas, 'aplicar', escolhas);
  const descartes = planoCatalogo(selecionadas, 'descartar', escolhas);
  const temPlano = (p: PlanoCatalogo) => p.sncf.length + p.fop.length > 0;
  const semCadastro = [...new Set((lista.data ?? []).filter(m => m.tipo === 'sem_cadastro').map(m => m.cod_cadastro))].sort();
  const erros = pendentesTodas.filter(m => m.tipo === 'erro' || !!m.erro);
  const totais = (ultima.data?.totais ?? {}) as Record<string, unknown>;
  const paginas = Math.max(1, Math.ceil(produtos.length / TAMANHO_PAGINA));
  const pagina = Math.max(1, Math.min(filtro.pagina, paginas));
  const visiveis = produtos.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA);
  const elegiveis = recorte.filter(selecionavel);
  const todos = elegiveis.length > 0 && elegiveis.every(c => selecionados.has(c.id));
  const alguns = elegiveis.some(c => selecionados.has(c.id));
  const marcar = (cs: CelulaCatalogo[], v: boolean) => setSelecionados(old => { const n = new Set(old); for (const c of cs) { if (v) n.add(c.id); else n.delete(c.id); } return n; });
  const carregando = lista.isLoading || referencia.isLoading || matriz.isLoading || nomes.isLoading || colecoes.isLoading;
  const falhas = [ultima.error, referencia.error, lista.error, matriz.error, nomes.error, colecoes.error, ultima.data?.erro, !matriz.isLoading && semRotulo.length ? `Campos sem rótulo na matriz: ${semRotulo.length}.` : null].filter(Boolean);
  const abrirPrevia = (acao: 'aplicar' | 'descartar', plano: PlanoCatalogo) => setPrevia({ acao, plano, celulas: selecionadas });

  return <section className="space-y-4 border-y py-4" id="atualizacao-do-dia">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1"><h2 className="text-lg font-semibold">Atualização do dia</h2>
        {ultima.data && <p className="text-sm font-medium">{texto(totais.mudanca ?? 0)} mudanças (Operações {mudancasDono.operacoes} · Produto {mudancasDono.produto}) · <span className="text-warning">{texto(totais.conflito ?? 0)} conflitos</span> · <span className="text-destructive">{texto(totais.erro ?? 0)} erros</span> · {texto(totais.sem_cadastro ?? 0)} sem cadastro</p>}
        {!!blocos.length && <p className="text-xs text-muted-foreground">{blocos.map(b => `${legivel(b)}: ${porBloco[b]}`).join(' · ')}</p>}
        <p className="text-xs text-muted-foreground">{ultima.isLoading ? 'Lendo…' : ultima.data ? `${ultima.data.status.replace(/_/g, ' ')} · ${fmtDataHora(ultima.data.lida_em)}` : 'Nenhuma leitura.'}</p>
        {referencia.data && ultima.data?.id !== referencia.data.id && <p className="text-xs text-muted-foreground">Pendências da leitura de {fmtDataHora(referencia.data.lida_em)}</p>}
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void copiar()} disabled={!ultima.data?.storage_path}><Download className="mr-2 h-4 w-4" />Cópia da planilha</Button><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Ler catálogo" size="sm" disabled={ler.isPending} onClick={() => ler.mutate()}><RefreshCw className="mr-2 h-4 w-4" />Ler agora</BotaoGuardado></div>
    </div>
    {falhas.map((e, i) => <Alert key={i} variant="destructive"><AlertDescription>{formatError(e)}</AlertDescription></Alert>)}
    <ColecoesNovasCatalogo novas={novasColecoes} />
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar código ou nome" placeholder="Código ou nome comercial" className="pl-9" value={filtro.busca} onChange={e => setFiltro({ busca: e.target.value, pagina: 1 })} /></div>
      <FiltroMultiSelect label="Coleção" opcoes={ordenar(oColecao, listaFiltro(filtro.colecoes))} selecionados={listaFiltro(filtro.colecoes)} rotulo={v => v + cont(oColecao, v)} onChange={v => setFiltro({ colecoes: juntarFiltro(v), pagina: 1 })} className="h-10" />
      <FiltroMultiSelect label="Linha" opcoes={ordenar(oLinha, listaFiltro(filtro.linhas))} selecionados={listaFiltro(filtro.linhas)} rotulo={v => v + cont(oLinha, v)} onChange={v => setFiltro({ linhas: juntarFiltro(v), pagina: 1 })} className="h-10" />
      <Select value={filtro.fase} onValueChange={fase => setFiltro({ fase, pagina: 1 })}><SelectTrigger className="w-52" aria-label="Filtrar por fase"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as fases</SelectItem>{['registrado', 'pre_venda', 'ativo', 'inativo'].map(f => <SelectItem key={f} value={f}>{legivel(f)}{cont(oFase, f)}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.bloco} onValueChange={bloco => setFiltro({ bloco, campo: 'todos', pagina: 1 })}><SelectTrigger className="w-56" aria-label="Filtrar por bloco"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os blocos</SelectItem>{blocos.map(b => <SelectItem key={b} value={b}>{legivel(b)}{cont(oBloco, b)}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.dono} onValueChange={dono => setFiltro({ dono, pagina: 1 })}><SelectTrigger className="w-56" aria-label="Filtrar por dono"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os donos</SelectItem>{([['operacoes', 'Operações'], ['produto', 'Produto']] as const).map(([v, r]) => <SelectItem key={v} value={v}>{r}{cont(oDono, v)}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.natureza} onValueChange={natureza => setFiltro({ natureza, pagina: 1 })}><SelectTrigger className="w-64" aria-label="Filtrar por natureza"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Toda natureza</SelectItem>{([['preencher', 'Preencher vazio'], ['alterar', 'Alterar valor existente']] as const).map(([v, r]) => <SelectItem key={v} value={v}>{r}{cont(oNatureza, v)}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.campo} onValueChange={campo => setFiltro({ campo, pagina: 1 })}><SelectTrigger className="w-56" aria-label="Filtrar por campo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os campos</SelectItem>{(matriz.data ?? []).filter(m => oCampo[m.campo] || m.campo === filtro.campo).map(m => <SelectItem key={m.campo} value={m.campo}>{m.rotulo}{cont(oCampo, m.campo)}</SelectItem>)}</SelectContent></Select>
      <Select value={filtro.tipo} onValueChange={tipo => setFiltro({ tipo, pagina: 1 })}><SelectTrigger className="w-52" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{([['mudanca', 'Mudança'], ['conflito', 'Conflito'], ['erro', 'Erro']] as const).map(([v, r]) => <SelectItem key={v} value={v}>{r}{cont(oTipo, v)}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Selecionar todos do filtro" checked={todos ? true : alguns ? 'indeterminate' : false} disabled={!elegiveis.length || resolver.isPending} onCheckedChange={v => marcar(elegiveis, v === true)} />Selecionar todos do filtro <span className="text-muted-foreground">({elegiveis.length} células)</span></label>
      <div className="flex gap-2"><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Aplicar catálogo" size="sm" disabled={!temPlano(aplicacoes) || resolver.isPending} onClick={() => abrirPrevia('aplicar', aplicacoes)}><Check className="mr-2 h-4 w-4" />Aplicar ({selecionadas.length})</BotaoGuardado><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Descartar catálogo" variant="outline" size="sm" disabled={!temPlano(descartes) || resolver.isPending} onClick={() => abrirPrevia('descartar', descartes)}><X className="mr-2 h-4 w-4" />Descartar ({selecionadas.length})</BotaoGuardado></div>
    </div>
    {selecionadas.some(c => c.tipo === 'conflito' && !escolhas[c.id]) && <p className="text-sm text-warning">Há conflitos selecionados sem escolha de planilha ou sistema.</p>}
    <div className="max-w-full overflow-hidden rounded-md border bg-card card-shadow"><Table containerClassName="max-h-[calc(100vh-37rem)] min-h-[18rem]" className="min-w-[1000px] w-max border-separate border-spacing-0"><TableHeader className="sticky top-0 z-20 bg-muted"><TableRow><TableHead colSpan={2} className="sticky left-0 z-30 border-r" />{faixas.map(f => <TableHead key={f.bloco} colSpan={f.n} className="h-8 border-l text-xs font-semibold uppercase tracking-wide">{legivel(f.bloco)}</TableHead>)}</TableRow><TableRow><TableHead className="sticky left-0 z-30 w-10 min-w-10" /><TableHead className="sticky left-10 z-30 w-64 min-w-64 border-r">Produto</TableHead>{colunas.map(m => { const cs = recorte.filter(c => c.campo === m.campo && selecionavel(c)); const n = cs.filter(c => selecionados.has(c.id)).length; return <TableHead key={m.campo} className="min-w-40 border-l"><span className="flex items-center gap-2"><Checkbox aria-label={`Selecionar coluna ${m.rotulo}`} checked={n && n === cs.length ? true : n ? 'indeterminate' : false} disabled={!cs.length || resolver.isPending} onCheckedChange={v => marcar(cs, v === true)} />{m.rotulo}</span>{(() => { const cf = cs.filter(c => c.tipo === 'conflito' && selecionados.has(c.id)); if (!cf.length) return null; const atual = cf.every(c => escolhas[c.id] === 'planilha') ? 'planilha' : cf.every(c => escolhas[c.id] === 'sistema') ? 'sistema' : ''; return <RadioGroup aria-label={`Escolha para todos os conflitos selecionados de ${m.rotulo}`} value={atual} disabled={resolver.isPending} onValueChange={v => { if (v === 'planilha' || v === 'sistema') setEscolhas(old => { const n = { ...old }; for (const c of cf) n[c.id] = v; return n; }); }} className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal"><span className="text-muted-foreground">Todos:</span>{(['planilha', 'sistema'] as const).map(v => <label key={v} className="flex items-center gap-1"><RadioGroupItem value={v} className="h-3 w-3" />{v === 'planilha' ? 'Planilha' : 'Sistema'}</label>)}</RadioGroup>; })()}</TableHead>; })}</TableRow></TableHeader><TableBody>
      {!falhas.length && !carregando && visiveis.map(p => <TableRow key={p.codigo} className="group bg-card hover:bg-muted/50"><TableCell className="sticky left-0 z-10 w-10 min-w-10 bg-card align-top group-hover:bg-muted"><Checkbox aria-label={`Selecionar produto ${p.codigo}`} checked={(() => { const cs = p.celulas.filter(selecionavel); const n = cs.filter(c => selecionados.has(c.id)).length; return n && n === cs.length ? true : n ? 'indeterminate' : false; })()} disabled={!p.celulas.some(selecionavel) || resolver.isPending} onCheckedChange={v => marcar(p.celulas.filter(selecionavel), v === true)} /></TableCell><TableCell className="sticky left-10 z-10 w-64 min-w-64 border-r bg-card align-top group-hover:bg-muted"><p className="font-mono text-sm font-semibold">{p.codigo}</p><p className="mt-1 text-sm">{p.nome || 'Nome comercial não informado'}</p></TableCell>{colunas.map(m => {
        const c = p.celulas.find(c => c.campo === m.campo);
        return <TableCell key={m.campo} className={`align-top border-l ${c?.tipo === 'conflito' ? 'bg-warning/10' : c?.tipo === 'erro' ? 'bg-destructive/10' : c && naturezaCelula(c) === 'alterar' ? 'bg-warning/5' : ''}`}>
          {c && ['mudanca', 'conflito'].includes(c.tipo) && <Checkbox className="mb-2" aria-label={`Selecionar célula ${p.codigo} ${m.rotulo}`} checked={selecionavel(c) && selecionados.has(c.id)} disabled={!selecionavel(c) || resolver.isPending} onCheckedChange={v => marcar([c], v === true)} />}
          {c && colecaoNaoCadastrada(c, colecoes.data ?? []) && <p className="mb-2 text-xs text-warning">coleção não cadastrada</p>}
          {!c ? <span className="text-muted-foreground">—</span> : c.tipo === 'erro' ? <div className="space-y-1 text-sm text-destructive"><p className="font-medium">Erro</p><p>{c.erro}</p><p className="break-words">Planilha: {texto(c.valor_planilha)}</p></div> : c.tipo === 'conflito' ? <div className="space-y-2 text-xs"><p className="font-semibold text-warning">Conflito</p><div className="space-y-1 break-words"><p><span className="text-muted-foreground">Base:</span> {texto(c.valor_base)}</p><p><span className="text-muted-foreground">Sistema:</span> {texto(c.valor_sistema)}</p><p><span className="text-muted-foreground">Planilha:</span> {texto(c.valor_planilha)}</p></div>{c.erro && <p className="text-destructive">{c.erro}</p>}<RadioGroup aria-label={`Escolha para ${p.codigo} ${m.rotulo}`} value={escolhas[c.id] ?? ''} disabled={resolver.isPending} onValueChange={v => { if (v === 'planilha' || v === 'sistema') setEscolhas(old => ({ ...old, [c.id]: v })); }} className="flex flex-wrap gap-3">{(['planilha', 'sistema'] as const).map(v => <label key={v} className="flex items-center gap-1"><RadioGroupItem value={v} />{v === 'planilha' ? 'Planilha' : 'Sistema'}</label>)}</RadioGroup></div> : <div className="flex flex-wrap items-baseline gap-1 text-sm break-words">{valorSistemaVazio(c.valor_sistema) ? <span className="text-muted-foreground">novo:</span> : <><span className="text-warning line-through decoration-warning/50">{texto(c.valor_sistema)}</span><span className="text-warning">→</span></>}<span className="font-medium">{texto(c.valor_planilha)}</span>{c.erro && <p className="w-full text-xs text-destructive">{c.erro}</p>}</div>}
        </TableCell>;
      })}</TableRow>)}
      {(carregando || !visiveis.length || !!falhas.length) && <TableRow><TableCell colSpan={colunas.length + 2} className="py-8 text-center text-muted-foreground">{falhas.length ? 'Não foi possível carregar a revisão.' : carregando ? 'Carregando produtos…' : 'Nenhuma pendência neste filtro.'}</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{produtos.length} produtos · {recorte.length} células no filtro · <strong className="text-foreground">{resumo.produtos} produtos · {resumo.celulas} células selecionadas (Operações {resumo.operacoes} · Produto {resumo.produto})</strong></span><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Página anterior do catálogo" disabled={pagina === 1} onClick={() => setFiltro({ pagina: pagina - 1 })}><ChevronLeft className="h-4 w-4" /></Button><span>Página {pagina} de {paginas}</span><Button variant="outline" size="icon" aria-label="Próxima página do catálogo" disabled={pagina === paginas} onClick={() => setFiltro({ pagina: pagina + 1 })}><ChevronRight className="h-4 w-4" /></Button></div></div>
    {!!semCadastro.length && <div className="border-t pt-2"><div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="sm" aria-expanded={semCadastroAberto} onClick={() => setSemCadastroAberto(v => !v)}>{semCadastroAberto ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}{semCadastro.length} códigos sem cadastro ({semCadastro[0]}–{semCadastro[semCadastro.length - 1]})</Button><Link className="text-sm text-primary underline" to="/vendas/produto/chegada-mercadoria?aba=cadastro-pi">→ Importação de PI</Link></div>{semCadastroAberto && <div className="max-h-48 overflow-auto p-3 font-mono text-sm text-muted-foreground">{semCadastro.join(' · ')}</div>}</div>}
    {!!erros.length && <div className="border-t pt-2"><Button variant="ghost" size="sm" className="text-destructive" aria-expanded={errosAberto} onClick={() => setErrosAberto(v => !v)}>{errosAberto ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}{erros.length} erros</Button>{errosAberto && <div className="max-h-48 overflow-auto space-y-2 p-3 text-sm">{erros.map(c => <p key={c.id}><strong>{c.cod_cadastro}</strong> · {rotulos[c.campo] ?? 'Campo não identificado na matriz'} · <span className="text-destructive">{c.erro}</span></p>)}</div>}</div>}
    <Dialog open={!!previa} onOpenChange={o => { if (!o && !resolver.isPending) setPrevia(null); }}><DialogContent><DialogHeader><DialogTitle>Confirmar {previa?.acao === 'descartar' ? 'descarte' : 'aplicação'} · {previa?.celulas.length} células</DialogTitle></DialogHeader>{previa?.acao === 'aplicar' && !!previa.plano.fop.length && <p className="text-sm text-muted-foreground">{previa.plano.fop.length} células (Produto e fiscais) serão gravadas no FOP; só ficam aplicadas quando o FOP confirmar.</p>}<div className="max-h-80 overflow-auto text-sm">{previa?.celulas.map(c => { const d = previa.plano.sncf.find(d => d.ids.includes(c.id)); const vaiPlanilha = previa.plano.fop.includes(c.id) || d?.escolha === 'planilha'; return <p key={c.id} className="border-b py-2">{c.cod_cadastro} · {rotulos[c.campo] ?? 'Campo não identificado na matriz'}: {texto(c.valor_sistema)} → {texto(vaiPlanilha ? c.valor_planilha : c.valor_sistema)}</p>; })}</div><DialogFooter><Button variant="outline" disabled={resolver.isPending} onClick={() => setPrevia(null)}>Voltar</Button><Button disabled={resolver.isPending} onClick={() => { if (previa) resolver.mutate(previa); }}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
