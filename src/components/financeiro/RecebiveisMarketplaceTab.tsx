import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/ui/selo';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { PedidoCanalDrawer, BlocoPedidoCanal, LinhaPedidoCanal } from '@/components/vendas/PedidoCanalDrawer';
import { RodapePaginacao } from '@/components/tabela/RodapePaginacao';
import { useRecebiveisMarketplace } from '@/hooks/financeiro/useRecebivelMarketplace';
import { usePreferenciaTela } from '@/hooks/usePreferenciaTela';
import { useEstadoTela } from '@/lib/navegacao/useEstadoTela';
import { abrirDetalhe } from '@/lib/navegacao/abrirDetalhe';
import { useFocoAoVoltar } from '@/lib/navegacao/useFocoAoVoltar';
import { useRestaurarScroll } from '@/lib/navegacao/useRestaurarScroll';
import { formatBRL, formatDateBR } from '@/lib/format-currency';
import { formatError } from '@/lib/format-error';
import { resumoMarketplace, dataLiberacaoMarketplace, rotulosStatusMarketplace, type StatusMarketplace } from '@/lib/financeiro/recebivelMarketplace';

export function StatusRecebivelMarketplace({ status }: { status: StatusMarketplace }) {
  return <Selo estado={status === 'liberado' ? 'success' : status === 'sem_pedido' ? 'destructive' : 'warning'} className="whitespace-normal">{rotulosStatusMarketplace[status]}</Selo>;
}
export function RecebiveisMarketplaceTab({ onRegistrarExport }: { onRegistrarExport: (e: { fn: () => void; ativo: boolean }) => void }) {
  const q = useRecebiveisMarketplace();
  const { preferencias, salvar } = usePreferenciaTela('recebiveis-marketplace', { tamanho: 20 });
  const tamanho = preferencias.tamanho;
  const [estado, setEstado] = useEstadoTela({ status: 'todos', detalhe: '', pagina: 1 }, { prefixo: 'mp' });
  const navigate = useNavigate(); const location = useLocation();
  useEffect(() => { onRegistrarExport({ fn: () => {}, ativo: false }); }, [onRegistrarExport]);
  const mes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const resumo = resumoMarketplace(q.data ?? [], mes);
  const linhas = (q.data ?? []).filter(r => estado.status === 'todos' || r.status === estado.status)
    .sort((a, b) => (dataLiberacaoMarketplace(a) ?? '9999').localeCompare(dataLiberacaoMarketplace(b) ?? '9999') || a.venda_id.localeCompare(b.venda_id));
  const pagina = Math.min(Math.max(1, estado.pagina), Math.max(1, Math.ceil(linhas.length / tamanho)));
  const visiveis = linhas.slice((pagina - 1) * tamanho, pagina * tamanho);
  const r = q.data?.find(r => r.venda_id === estado.detalhe);
  useFocoAoVoltar({ pronto: !q.isPending, idsVisiveis: visiveis.map(r => r.venda_id) });
  useRestaurarScroll(null, !q.isPending);
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="card-shadow"><CardHeader className="pb-2"><CardTitle className="text-sm">A liberar</CardTitle></CardHeader><CardContent><div className="text-2xl tabular-nums">{q.isPending ? '—' : formatBRL(resumo.aLiberar)}</div><p className="text-xs text-muted-foreground">{resumo.vendas} vendas</p></CardContent></Card>
      <Card className="card-shadow"><CardHeader className="pb-2"><CardTitle className="text-sm">Liberado no mês</CardTitle></CardHeader><CardContent><div className="text-2xl tabular-nums">{q.isPending ? '—' : formatBRL(resumo.liberadoMes)}</div></CardContent></Card>
      <Card className={`card-shadow ${resumo.semPedido > 0 ? 'border-destructive/40 bg-destructive/10' : ''}`}><CardHeader className="pb-2"><CardTitle className="text-sm">Sem pedido</CardTitle></CardHeader><CardContent><div className={`text-2xl tabular-nums ${resumo.semPedido > 0 ? 'text-destructive' : ''}`}>{q.isPending ? '—' : resumo.semPedido}</div></CardContent></Card>
    </div>
    <Select value={estado.status} onValueChange={status => setEstado({ status, pagina: 1 })}><SelectTrigger aria-label="Status Marketplace" className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Status: todos</SelectItem>{Object.entries(rotulosStatusMarketplace).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
    {q.error && <div role="alert" className="text-sm text-destructive">{formatError(q.error)} <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Tentar novamente</Button></div>}
    <Card className="card-shadow"><CardContent className="p-0">
      <Table containerClassName="overflow-visible" className="w-full table-fixed max-md:[&_thead]:hidden max-md:[&_tbody]:block max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_tr]:gap-x-2 max-md:[&_tr]:p-3 max-md:[&_td]:block max-md:[&_td]:border-0 max-md:[&_td]:px-0 max-md:[&_td]:py-1">
        <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Data da venda</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Tarifas</TableHead><TableHead className="text-right">Líquido</TableHead><TableHead>Liberação</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{visiveis.map(r => <TableRow key={r.venda_id} data-foco-id={r.venda_id} tabIndex={0} aria-label={`Abrir ${r.pedido_ref ?? r.order_id ?? r.source_id}`} className="cursor-pointer" onClick={() => setEstado({ detalhe: r.venda_id })} onKeyDown={e => { if (e.key === 'Enter') setEstado({ detalhe: r.venda_id }); }}>
          <TableCell className="break-words font-mono text-xs">{r.pedido_ref ?? 'Sem pedido'}{r.status === 'sem_pedido' && <div className="mt-1 break-all text-destructive">{r.order_id ?? r.pack_id}</div>}</TableCell>
          <TableCell className="text-xs"><span className="block text-muted-foreground md:hidden">Data da venda</span>{formatDateBR(r.data_venda?.slice(0, 10))}</TableCell>
          <TableCell className="text-right text-xs tabular-nums max-md:text-left"><span className="block text-muted-foreground md:hidden">Bruto</span>{formatBRL(r.valor_bruto)}</TableCell>
          <TableCell className="text-right text-xs tabular-nums max-md:text-left"><span className="block text-muted-foreground md:hidden">Tarifas</span>{formatBRL(r.tarifa_total)}</TableCell>
          <TableCell className="text-right text-xs font-medium tabular-nums max-md:text-left"><span className="block font-normal text-muted-foreground md:hidden">Líquido</span>{formatBRL(r.valor_liquido)}</TableCell>
          <TableCell className="text-xs"><span className="block text-muted-foreground md:hidden">Liberação</span>{formatDateBR(dataLiberacaoMarketplace(r))}{r.status !== 'liberado' && <span className="block text-muted-foreground">prevista</span>}</TableCell>
          <TableCell><StatusRecebivelMarketplace status={r.status} /></TableCell>
        </TableRow>)}{!visiveis.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground max-md:col-span-2">{q.isPending ? 'Carregando vendas…' : q.error ? 'Não foi possível carregar as vendas.' : estado.status === 'todos' ? 'Nenhuma venda Marketplace registrada.' : 'Nenhuma venda com este status.'}</TableCell></TableRow>}</TableBody>
      </Table><RodapePaginacao total={linhas.length} pagina={pagina} tamanhoPagina={tamanho} onPagina={pagina => setEstado({ pagina })} onTamanhoPagina={tamanho => { salvar({ tamanho }); setEstado({ pagina: 1 }); }} />
    </CardContent></Card>
    {r && <PedidoCanalDrawer open onOpenChange={aberto => { if (!aberto) setEstado({ detalhe: '' }); }} titulo={r.pedido_ref ?? 'Venda sem pedido'} descricao={r.conta_rotulo}>
      <StatusRecebivelMarketplace status={r.status} />
      <BlocoPedidoCanal titulo="Item"><p className="text-sm break-words">{r.descricao_item ?? '—'}</p><p className="break-all font-mono text-xs text-muted-foreground">{r.sku ?? '—'}</p></BlocoPedidoCanal>
      <BlocoPedidoCanal titulo="Valores"><LinhaPedidoCanal rotulo="Bruto">{formatBRL(r.valor_bruto)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Comissão">{formatBRL(r.comissao)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Frete">{formatBRL(r.frete)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Parcelamento">{formatBRL(r.taxa_financiamento)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Impostos">{formatBRL(r.impostos)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Tarifas totais">{formatBRL(r.tarifa_total)}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Líquido a receber"><strong>{formatBRL(r.valor_liquido)}</strong></LinhaPedidoCanal></BlocoPedidoCanal>
      <BlocoPedidoCanal titulo="Datas"><LinhaPedidoCanal rotulo="Venda">{formatDateBR(r.data_venda?.slice(0, 10))}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Liberação prevista">{formatDateBR(r.data_liberacao_prevista)}</LinhaPedidoCanal>{r.data_liberacao && <LinhaPedidoCanal rotulo="Liberado em">{formatDateBR(r.data_liberacao)}</LinhaPedidoCanal>}</BlocoPedidoCanal>
      <BlocoPedidoCanal titulo="Identificadores"><div className={`space-y-2 break-all ${r.status === 'sem_pedido' ? 'border-l-2 border-destructive pl-3 font-medium' : ''}`}><LinhaPedidoCanal rotulo="Pedido Mercado Livre">{r.order_id ?? '—'}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Pacote">{r.pack_id ?? '—'}</LinhaPedidoCanal><LinhaPedidoCanal rotulo="Pagamento Mercado Pago">{r.source_id}</LinhaPedidoCanal></div></BlocoPedidoCanal>
      {r.pedido_id && <Button variant="outline" onClick={() => abrirDetalhe(navigate, location, `/pedidos/${r.pedido_id}`, { foco: r.venda_id, label: 'Recebíveis Marketplace' })}><ExternalLink className="h-4 w-4" />Abrir pedido</Button>}
    </PedidoCanalDrawer>}
  </div>;
}