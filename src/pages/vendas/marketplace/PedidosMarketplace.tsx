import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Settings2, AlertTriangle, FileText, Package, Truck, PackageCheck, RotateCcw, Ban } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { CasaPageHeader } from '@/components/casa/CasaPageHeader';
import { PipelineFases } from '@/components/vendas/PipelineFases';
import { ordenarPor, type SortState } from '@/components/shared/SortableTableHead';
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from '@/components/tabela/CabecalhoOrdenavel';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Selo } from '@/components/ui/selo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RodapePaginacao, type PageSizeOption } from '@/components/tabela/RodapePaginacao';
import { useEstadoTela } from '@/lib/navegacao/useEstadoTela';
import { lerOrdemKD, escreverOrdemKD } from '@/lib/navegacao/codecUrl';
import { useFocoAoVoltar } from '@/lib/navegacao/useFocoAoVoltar';
import { useRestaurarScroll } from '@/lib/navegacao/useRestaurarScroll';
import { usePreferenciaTela } from '@/hooks/usePreferenciaTela';
import { formatBRL } from '@/lib/format-currency';
import { fmtDataHora } from '@/lib/data';
import { formatError } from '@/lib/format-error';
import { useMarketplace, useCadastroMarketplace } from './useMarketplace';
import { filtrarPedidos } from './regras';
import { MarketplaceDrawer } from './MarketplaceDrawer';
import { TransporteDialog } from './TransporteDialog';
import { DevolucaoMarketplaceDialog } from './DevolucaoMarketplaceDialog';
import { PortadoresDialog } from './PortadoresDialog';

const ICONES: Record<string, JSX.Element> = {
  aguardando_nf: <FileText className="h-4 w-4" />, no_cd: <Package className="h-4 w-4" />,
  em_transporte: <Truck className="h-4 w-4" />, entregue: <PackageCheck className="h-4 w-4" />,
  devolucao: <RotateCcw className="h-4 w-4" />, cancelado: <Ban className="h-4 w-4" />,
};
type Coluna = 'id_externo' | 'bling_numero' | 'data_pedido' | 'cliente_nome' | 'cd_nome' | 'valor_liquido' | 'estagio_ordem' | 'area_responsavel' | 'proxima_acao' | 'rastreio_codigo';
const colunas: [Coluna, string][] = [
  ['id_externo', 'Pedido'], ['bling_numero', 'Bling'], ['data_pedido', 'Data / Idade'], ['cliente_nome', 'Cliente'],
  ['cd_nome', 'CD'], ['valor_liquido', 'Valor'], ['estagio_ordem', 'Estágio'], ['area_responsavel', 'Dono'],
  ['proxima_acao', 'Próxima ação'], ['rastreio_codigo', 'Rastreio'],
];
const descendentes: Coluna[] = ['id_externo', 'bling_numero', 'data_pedido', 'valor_liquido'];
export default function PedidosMarketplace() {
  const pedidos = useMarketplace(); const cadastro = useCadastroMarketplace();
  const [estado, setEstado] = useEstadoTela({ busca: '', marketplace: 'todos', estagio: 'todos', comAlerta: false, ordem: '', pagina: 1, detalhe: '' }, { replaceKeys: ['busca'] });
  const { preferencias, salvar } = usePreferenciaTela('tela.pedidos_marketplace', { tamanho: 20 });
  const tamanho = preferencias.tamanho;
  const [config, setConfig] = useState(false); const [acao, setAcao] = useState<'transporte' | 'devolucao' | null>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const [alturaPipeline, setAlturaPipeline] = useState(0);
  useEffect(() => {
    const el = pipelineRef.current;
    if (!el) return;
    const atualizar = () => setAlturaPipeline(el.getBoundingClientRect().height);
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const bruto = lerOrdemKD(estado.ordem);
  const sort: SortState<Coluna> | null = bruto && colunas.some(([c]) => c === bruto.key) ? { column: bruto.key as Coluna, direction: bruto.dir } : null;
  const base = useMemo(() => filtrarPedidos(pedidos.data ?? [], { ...estado, estagio: 'todos', comAlerta: false }), [pedidos.data, estado]);
  const filtrados = useMemo(() => ordenarPor(filtrarPedidos(base, { ...estado, busca: '', marketplace: 'todos' }), sort, {
    id_externo: p => p.id_externo, bling_numero: p => p.bling_numero == null ? null : Number(p.bling_numero),
    data_pedido: p => p.data_pedido, cliente_nome: p => p.cliente_nome, cd_nome: p => p.cd_nome,
    valor_liquido: p => p.valor_liquido == null ? null : Number(p.valor_liquido), estagio_ordem: p => p.estagio_ordem,
    area_responsavel: p => p.area_responsavel, proxima_acao: p => p.proxima_acao, rastreio_codigo: p => p.rastreio_codigo,
  }), [base, estado, sort?.column, sort?.direction]);
  const fases = useMemo(() => (cadastro.data?.estagios ?? []).map(f => {
    const lista = base.filter(p => p.estagio === f.codigo);
    return { codigo: f.codigo, rotulo: f.rotulo, proxima_acao: lista.find(p => p.proxima_acao)?.proxima_acao,
      qtd: lista.length, valor: lista.reduce((v, p) => v + Number(p.valor_liquido ?? 0), 0),
      alertas: lista.filter(p => p.alerta != null).length, icone: ICONES[f.codigo] };
  }), [base, cadastro.data?.estagios]);
  const emAndamento = base.filter(p => !p.eh_final);
  const pagina = Math.min(Math.max(1, estado.pagina), Math.max(1, Math.ceil(filtrados.length / tamanho)));
  const visiveis = filtrados.slice((pagina - 1) * tamanho, pagina * tamanho);
  const selecionado = pedidos.data?.find(p => p.pedido_id === estado.detalhe);
  useFocoAoVoltar({ pronto: !pedidos.isPending, idsVisiveis: visiveis.map(p => p.pedido_id) });
  useRestaurarScroll(null, !pedidos.isPending);
  const erro = pedidos.error ?? cadastro.error;
  const ordenar = (coluna: Coluna) => {
    const inicial = descendentes.includes(coluna) ? 'desc' : 'asc';
    const proxima = sort?.column !== coluna ? { key: coluna, dir: inicial as 'asc' | 'desc' }
      : sort.direction === inicial ? { key: coluna, dir: (inicial === 'asc' ? 'desc' : 'asc') as 'asc' | 'desc' } : null;
    setEstado({ ordem: escreverOrdemKD(proxima), pagina: 1 });
  };
  return <PageShell>
    <CasaPageHeader breadcrumb={[{ label: 'Vendas' }, { label: 'Pedidos Marketplace' }]} title="Pedidos Marketplace"
      subtitle="Pedidos TikTok Shop, Mercado Livre e Shopee vindos do Bling — o funil aqui é faturar, expedir, rastrear e entregar."
      actions={<Button variant="outline" size="sm" onClick={() => setConfig(true)}><Settings2 className="h-4 w-4" />Portadores</Button>} />
    <div className="space-y-4" style={{ '--fila-topo-colado': `${64 + alturaPipeline}px` } as CSSProperties}>
      <div ref={pipelineRef} className="sticky top-16 z-20 -mx-6 border-b bg-background px-6 py-2">
        <PipelineFases fases={fases} estagioAtivo={estado.estagio === 'todos' ? null : estado.estagio}
          onClickEstagio={estagio => setEstado({ estagio, pagina: 1 })}
          onLimparFiltro={() => setEstado({ estagio: 'todos', pagina: 1 })}
          carregando={pedidos.isPending || cadastro.isPending} erro={erro ? formatError(erro) : null} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-[240px]" aria-label="Buscar pedidos marketplace" placeholder="Buscar por pedido, cliente ou nº marketplace…" value={estado.busca} onChange={e => setEstado({ busca: e.target.value, pagina: 1 })} />
        <Select value={estado.marketplace} onValueChange={marketplace => setEstado({ marketplace, pagina: 1 })}>
          <SelectTrigger className="w-[190px]" aria-label="Marketplace"><SelectValue placeholder="Marketplace" /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Marketplace: todos</SelectItem>{cadastro.data?.lojas.map(l => <SelectItem key={l.codigo} value={l.codigo}>{l.nome}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={estado.comAlerta ? 'com' : 'todos'} onValueChange={v => setEstado({ comAlerta: v === 'com', pagina: 1 })}>
          <SelectTrigger className="w-[210px]" aria-label="Alerta"><SelectValue placeholder="Alerta" /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Alerta: todos</SelectItem><SelectItem value="com">Com alerta</SelectItem></SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtrados.length} pedido{filtrados.length !== 1 ? 's' : ''} · {emAndamento.length} em andamento ({formatBRL(emAndamento.reduce((v, p) => v + Number(p.valor_liquido ?? 0), 0))})</span>
      </div>
      {erro ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{formatError(erro)} <Button variant="outline" size="sm" onClick={() => { void pedidos.refetch(); void cadastro.refetch(); }}>Tentar novamente</Button></div> : null}
      <Card><CardContent className="p-0"><TooltipProvider><Table containerClassName="overflow-visible" className="w-full table-fixed">
        <colgroup><col className="w-[15%]" /><col className="w-[5%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[8%]" /><col className="w-[3%]" /></colgroup>
        <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
          {colunas.map(([c, rotulo]) => <CabecalhoOrdenavel key={c} rotulo={rotulo} dir={sort?.column === c ? sort.direction : null} onOrdenar={() => ordenar(c)} alinharDireita={c === 'valor_liquido'} className={c === 'valor_liquido' ? 'px-2 text-right' : 'px-2'} />)}
          <TableHead className="w-8 px-1"><span className="sr-only">Alerta</span></TableHead>
        </TableRow></TableHeader><TableBody>
          {pedidos.isPending || cadastro.isPending ? <TableRow><TableCell colSpan={11} className="py-8 text-center"><Skeleton className="mx-auto h-4 w-32" /></TableCell></TableRow> : visiveis.map(p => <TableRow key={p.pedido_id} data-foco-id={p.pedido_id} tabIndex={0} aria-label={`Abrir ${p.id_externo}`} className="cursor-pointer transition-colors duration-700" onClick={() => setEstado({ detalhe: p.pedido_id })} onKeyDown={e => { if (e.key === 'Enter') setEstado({ detalhe: p.pedido_id }); }}>
            <TableCell className="px-2"><div className="flex flex-wrap items-center gap-1"><span className="font-mono text-xs">{p.id_externo}</span><Selo estado="info">{p.marketplace_nome}</Selo></div></TableCell>
            <TableCell className="px-2 font-mono text-xs">{p.bling_numero ? `#${p.bling_numero}` : '—'}</TableCell>
            <TableCell className="px-2 text-xs"><div>{fmtDataHora(p.data_pedido)}</div><div className="text-muted-foreground">{p.horas_no_estagio == null ? '—' : `há ${Number((Number(p.horas_no_estagio) / 24).toFixed(1))} d`}</div></TableCell>
            <TableCell className="px-2 text-xs"><div className="truncate" title={p.cliente_nome ?? ''}>{p.cliente_nome ?? '—'}</div><div className="truncate text-muted-foreground">{[p.cidade, p.uf].filter(Boolean).join('/') || '—'}</div></TableCell>
            <TableCell className="break-words px-2 text-xs">{p.cd_nome ?? '—'}</TableCell>
            <TableCell className="px-2 text-right text-xs tabular-nums">{p.valor_liquido == null ? '—' : formatBRL(p.valor_liquido)}</TableCell>
            <TableCell className="px-2"><Selo estado={p.estagio === 'cancelado' ? 'destructive' : p.eh_final ? 'success' : 'info'} className="max-w-full whitespace-normal">{p.estagio_rotulo ?? '—'}</Selo>{p.subetapa && <p className="mt-1 truncate text-[10px] text-muted-foreground" title={p.subetapa}>{p.subetapa}</p>}</TableCell>
            <TableCell className="break-words px-2 text-xs text-muted-foreground">{p.area_responsavel ?? '—'}</TableCell>
            <TableCell className="px-2 text-xs"><span className="line-clamp-2" title={p.proxima_acao ?? ''}>{p.proxima_acao ?? '—'}</span></TableCell>
            <TableCell className="px-2"><div className="break-words font-mono text-xs">{p.rastreio_codigo ?? '—'}</div>{p.rastreio_status && <div className="mt-1 break-words text-[10px] text-muted-foreground">{p.rastreio_status}</div>}</TableCell>
            <TableCell className="px-1">{p.alerta != null && <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={p.alerta} className="inline-flex text-warning-strong"><AlertTriangle className="h-4 w-4" /></span></TooltipTrigger><TooltipContent className="max-w-xs">{p.alerta}</TooltipContent></Tooltip>}</TableCell>
          </TableRow>)}{!pedidos.isPending && !cadastro.isPending && !visiveis.length && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum pedido nesta seleção.</TableCell></TableRow>}
        </TableBody>
      </Table></TooltipProvider><RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanho as PageSizeOption} onPagina={p => setEstado({ pagina: p })} onTamanhoPagina={v => { salvar({ tamanho: v }); setEstado({ pagina: 1 }); }} /></CardContent></Card>
    </div>
    {selecionado && <MarketplaceDrawer pedido={selecionado} onClose={() => setEstado({ detalhe: '' })} onTransporte={() => setAcao('transporte')} onDevolucao={() => setAcao('devolucao')} />}
    {selecionado && acao === 'transporte' && <TransporteDialog pedido={selecionado} portadores={cadastro.data?.portadores ?? []} onClose={() => setAcao(null)} />}
    {selecionado && acao === 'devolucao' && <DevolucaoMarketplaceDialog pedido={selecionado} onClose={() => setAcao(null)} />}
    {config && <PortadoresDialog onClose={() => setConfig(false)} />}
  </PageShell>;
}
