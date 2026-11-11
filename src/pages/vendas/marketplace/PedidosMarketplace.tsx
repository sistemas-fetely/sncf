import { useMemo, useState } from 'react';
import { Settings2, AlertTriangle, Loader2 } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiPill } from '@/components/shared/KpiPill';
import { SortableTableHead, ordenarPor, type SortState } from '@/components/shared/SortableTableHead';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Selo } from '@/components/ui/selo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RodapePaginacao, type PageSizeOption } from '@/components/tabela/RodapePaginacao';
import { useEstadoTela } from '@/lib/navegacao/useEstadoTela';
import { lerOrdemKD, escreverOrdemKD } from '@/lib/navegacao/codecUrl';
import { useFocoAoVoltar } from '@/lib/navegacao/useFocoAoVoltar';
import { useRestaurarScroll } from '@/lib/navegacao/useRestaurarScroll';
import { usePreferenciaTela } from '@/hooks/usePreferenciaTela';
import { useNavegacaoMenu } from '@/hooks/useMenuApp';
import { formatBRL } from '@/lib/format-currency';
import { formatError } from '@/lib/format-error';
import { useMarketplace, useCadastroMarketplace } from './useMarketplace';
import { filtrarPedidos } from './regras';
import { MarketplaceDrawer } from './MarketplaceDrawer';
import { TransporteDialog } from './TransporteDialog';
import { DevolucaoMarketplaceDialog } from './DevolucaoMarketplaceDialog';
import { PortadoresDialog } from './PortadoresDialog';
type Coluna = 'id_externo' | 'marketplace_nome' | 'cliente_nome' | 'valor_liquido' | 'estagio_ordem' | 'nf_numero' | 'transportadora_nome';
const colunas: [Coluna, string][] = [['id_externo', 'Pedido'], ['marketplace_nome', 'Marketplace'], ['cliente_nome', 'Cliente'], ['valor_liquido', 'Valor'], ['estagio_ordem', 'Fase'], ['nf_numero', 'NF'], ['transportadora_nome', 'Transportadora']];
export default function PedidosMarketplace() {
  const pedidos = useMarketplace(); const cadastro = useCadastroMarketplace(); const nav = useNavegacaoMenu();
  const titulo = nav.data?.find(n => n.rota === '/vendas/marketplace')?.label ?? 'Pedidos Marketplace';
  const [estado, setEstado] = useEstadoTela({ busca: '', marketplace: 'todos', estagio: 'todos', comAlerta: false, ordem: '', pagina: 1, detalhe: '' }, { replaceKeys: ['busca'] });
  const { preferencias, salvar } = usePreferenciaTela('tela.pedidos_marketplace', { tamanho: 20 });
  const tamanho = preferencias.tamanho;
  const [config, setConfig] = useState(false); const [acao, setAcao] = useState<'transporte' | 'devolucao' | null>(null);
  const bruto = lerOrdemKD(estado.ordem);
  const sort: SortState<Coluna> | null = bruto && colunas.some(([c]) => c === bruto.key) ? { column: bruto.key as Coluna, direction: bruto.dir } : null;
  const base = useMemo(() => filtrarPedidos(pedidos.data ?? [], { ...estado, estagio: 'todos', comAlerta: false }), [pedidos.data, estado]);
  const filtrados = useMemo(() => ordenarPor(filtrarPedidos(base, { ...estado, busca: '', marketplace: 'todos' }), sort, {
    id_externo: p => p.id_externo, marketplace_nome: p => p.marketplace_nome, cliente_nome: p => p.cliente_nome,
    valor_liquido: p => p.valor_liquido == null ? null : Number(p.valor_liquido), estagio_ordem: p => p.estagio_ordem,
    nf_numero: p => p.nf_numero, transportadora_nome: p => p.transportadora_nome,
  }), [base, estado, sort?.column, sort?.direction]);
  const pagina = Math.min(Math.max(1, estado.pagina), Math.max(1, Math.ceil(filtrados.length / tamanho)));
  const visiveis = filtrados.slice((pagina - 1) * tamanho, pagina * tamanho);
  const selecionado = pedidos.data?.find(p => p.pedido_id === estado.detalhe);
  useFocoAoVoltar({ pronto: !pedidos.isPending, idsVisiveis: visiveis.map(p => p.pedido_id) });
  useRestaurarScroll(null, !pedidos.isPending);
  const erro = pedidos.error ?? cadastro.error;
  return <PageShell><PageHeader titulo={titulo} acoes={<Button variant="ghost" size="sm" onClick={() => setConfig(true)}><Settings2 className="mr-2 h-4 w-4" />Portadores</Button>} />
    {erro ? <div role="alert" className="space-y-3 text-destructive"><p>{formatError(erro)}</p><Button variant="outline" onClick={() => { void pedidos.refetch(); void cadastro.refetch(); }}>Tentar novamente</Button></div> : <>
      <div className="flex flex-wrap gap-2 rounded-md bg-card p-2 card-shadow">
        <KpiPill label="Todas" count={base.length} color="blue" active={estado.estagio === 'todos' && !estado.comAlerta} estiloAtivo="suave" onClick={() => setEstado({ estagio: 'todos', comAlerta: false, pagina: 1 })} />
        {cadastro.data?.estagios.map(f => <KpiPill key={f.codigo} label={f.rotulo} count={base.filter(p => p.estagio === f.codigo).length} color={f.eh_final ? 'emerald' : 'blue'} estiloAtivo="suave" active={estado.estagio === f.codigo} onClick={() => setEstado({ estagio: estado.estagio === f.codigo ? 'todos' : f.codigo, pagina: 1 })} />)}
        <KpiPill label="Com alerta" count={base.filter(p => p.alerta != null).length} color="amber" estiloAtivo="suave" active={estado.comAlerta} icon={<AlertTriangle className="h-3 w-3" />} onClick={() => setEstado({ comAlerta: !estado.comAlerta, pagina: 1 })} />
      </div>
      <div className="flex flex-wrap items-center gap-2"><Input className="w-full sm:w-72" aria-label="Buscar pedidos marketplace" placeholder="Pedido, cliente ou nº marketplace" value={estado.busca} onChange={e => setEstado({ busca: e.target.value, pagina: 1 })} /><Button size="sm" variant={estado.marketplace === 'todos' ? 'secondary' : 'ghost'} onClick={() => setEstado({ marketplace: 'todos', pagina: 1 })}>Todos</Button>{cadastro.data?.lojas.map(l => <Button key={l.codigo} size="sm" variant={estado.marketplace === l.codigo ? 'secondary' : 'ghost'} onClick={() => setEstado({ marketplace: l.codigo, pagina: 1 })}>{l.nome}</Button>)}</div>
      {pedidos.isPending || cadastro.isPending ? <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pedidos…</div> : <div className="overflow-hidden rounded-md border border-border bg-card card-shadow"><Table className="w-full table-fixed"><colgroup><col className="w-[24%] sm:w-[10%]" /><col className="hidden sm:table-column sm:w-[13%]" /><col className="w-[27%] sm:w-[21%]" /><col className="w-[22%] sm:w-[11%]" /><col className="w-[27%] sm:w-[17%]" /><col className="hidden sm:table-column sm:w-[7%]" /><col className="hidden sm:table-column sm:w-[17%]" /><col className="hidden sm:table-column sm:w-[4%]" /></colgroup><TableHeader><TableRow>{colunas.map(([c, label]) => <SortableTableHead key={c} column={c} sort={sort} onSort={s => setEstado({ ordem: escreverOrdemKD(s ? { key: s.column, dir: s.direction } : null), pagina: 1 })} className={["px-2 text-xs", ["marketplace_nome", "nf_numero", "transportadora_nome"].includes(c) ? "hidden sm:table-cell" : ""].join(" ")} align={c === 'valor_liquido' ? 'right' : 'left'}>{label}</SortableTableHead>)}<TableHead className="hidden px-1 sm:table-cell"><span className="sr-only">Alerta</span></TableHead></TableRow></TableHeader><TableBody>
        {visiveis.map(p => <TableRow key={p.pedido_id} data-foco-id={p.pedido_id} tabIndex={0} aria-label={`Abrir ${p.id_externo}`} className="cursor-pointer" onClick={() => setEstado({ detalhe: p.pedido_id })} onKeyDown={e => { if (e.key === 'Enter') setEstado({ detalhe: p.pedido_id }); }}>
          <TableCell className="break-words px-2 text-xs font-medium text-primary">{p.id_externo}<span className="mt-1 block text-[10px] text-info-strong sm:hidden">{p.marketplace_nome}</span></TableCell><TableCell className="hidden px-2 sm:table-cell"><Selo estado="info" className="max-w-full whitespace-normal break-words">{p.marketplace_nome}</Selo></TableCell><TableCell className="px-2"><p className="truncate text-xs" title={p.cliente_nome ?? ''}>{p.cliente_nome ?? '—'}</p><p className="truncate text-[11px] text-muted-foreground">{[p.cidade, p.uf].filter(Boolean).join(' / ')}</p></TableCell><TableCell className="px-2 text-right text-xs tabular-nums">{p.valor_liquido == null ? '—' : formatBRL(p.valor_liquido)}</TableCell><TableCell className="px-2"><Selo estado={p.eh_final ? 'success' : 'warning'} className="max-w-full whitespace-normal">{p.estagio_rotulo ?? '—'}</Selo>{p.subetapa && <p className="mt-1 truncate text-[11px] text-muted-foreground" title={p.subetapa}>{p.subetapa}</p>}</TableCell><TableCell className="hidden break-words px-2 text-xs sm:table-cell">{p.nf_numero ?? '—'}</TableCell><TableCell className="hidden px-2 sm:table-cell"><p className="truncate text-xs" title={p.transportadora_nome ?? ''}>{p.transportadora_nome ?? '—'}</p></TableCell><TableCell className="hidden px-1 sm:table-cell">{p.alerta != null && <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={p.alerta} className="inline-flex text-warning-strong"><AlertTriangle className="h-4 w-4" /></span></TooltipTrigger><TooltipContent className="max-w-xs">{p.alerta}</TooltipContent></Tooltip>}</TableCell>
        </TableRow>)}{!visiveis.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum pedido encontrado.</TableCell></TableRow>}
      </TableBody></Table><RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanho as PageSizeOption} onPagina={p => setEstado({ pagina: p })} onTamanhoPagina={v => { salvar({ tamanho: v }); setEstado({ pagina: 1 }); }} /></div>}
    </>}
    {selecionado && <MarketplaceDrawer pedido={selecionado} onClose={() => setEstado({ detalhe: '' })} onTransporte={() => setAcao('transporte')} onDevolucao={() => setAcao('devolucao')} />}
    {selecionado && acao === 'transporte' && <TransporteDialog pedido={selecionado} portadores={cadastro.data?.portadores ?? []} onClose={() => setAcao(null)} />}
    {selecionado && acao === 'devolucao' && <DevolucaoMarketplaceDialog pedido={selecionado} onClose={() => setAcao(null)} />}
    {config && <PortadoresDialog onClose={() => setConfig(false)} />}
  </PageShell>;
}