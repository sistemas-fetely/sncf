import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEstadoTela } from '@/lib/navegacao/useEstadoTela';
import { abrirDetalhe } from '@/lib/navegacao/abrirDetalhe';
import { useFocoAoVoltar } from '@/lib/navegacao/useFocoAoVoltar';
import { useRestaurarScroll } from '@/lib/navegacao/useRestaurarScroll';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Selo } from '@/components/ui/selo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RodapePaginacao } from '@/components/tabela/RodapePaginacao';
import { formatBRL } from '@/lib/format-currency';
import { formatError } from '@/lib/format-error';
import { useCadastroMarketplace, useMarketplace, usePortadorPadrao, type PedidoMarketplace } from './useMarketplace';
import { filtrarPedidos } from './regras';
import { PortadorSelect } from './PortadorSelect';
import { TransporteDialog } from './TransporteDialog';

const dinheiro = (v: number | null) => v == null ? '—' : formatBRL(v);
export function MarketplaceTab() {
  const pedidos = useMarketplace();
  const cadastro = useCadastroMarketplace();
  const padrao = usePortadorPadrao();
  const permissaoTransporte = usePermissaoAcao('acao.pedido_transporte_registrar');
  const permissaoPadrao = usePermissaoAcao('acao.marketplace_transportadora_padrao_set');
  const [estado, setEstado] = useEstadoTela({ marketplace: 'todos', estagio: 'todos', semTransportadora: false, semCusto: false, busca: '', pagina: 1 }, { prefixo: 'mkt', replaceKeys: ['busca'] });
  const [selecionado, setSelecionado] = useState<PedidoMarketplace | null>(null);
  const [erroPadrao, setErroPadrao] = useState<{ codigo: string; mensagem: string } | null>(null);
  const [tamanho, setTamanho] = useState(20);
  const navigate = useNavigate();
  const location = useLocation();
  const filtrados = useMemo(() => filtrarPedidos(pedidos.data ?? [], estado).reverse(), [pedidos.data, estado]);
  const pagina = Math.min(Math.max(1, estado.pagina), Math.max(1, Math.ceil(filtrados.length / tamanho)));
  const visiveis = filtrados.slice((pagina - 1) * tamanho, pagina * tamanho);
  useFocoAoVoltar({ pronto: !pedidos.isPending, idsVisiveis: visiveis.map(p => p.pedido_id), focoParam: 'mkt_foco' });
  useRestaurarScroll(null, !pedidos.isPending);
  const estagios = cadastro.data?.estagios ?? [];
  const rotuloEstagio = (codigo: string | null) => estagios.find(e => e.estagio_codigo === codigo)?.rotulo ?? codigo ?? '—';
  const trocarPadrao = async (codigo: string, id: string | null) => {
    setErroPadrao(null);
    try { await padrao.mutateAsync({ p_marketplace_codigo: codigo, p_parceiro_id: id, p_observacao: '' }); toast.success('Portador padrão atualizado.'); }
    catch (e) { const mensagem = formatError(e); setErroPadrao({ codigo, mensagem }); toast.error(mensagem); }
  };
  const erro = pedidos.error ?? cadastro.error;
  if (erro) return <div role="alert" className="space-y-3 text-sm text-destructive"><p className="whitespace-pre-wrap">{formatError(erro)}</p><Button variant="outline" onClick={() => { void pedidos.refetch(); void cadastro.refetch(); }}>Tentar novamente</Button></div>;
  return <div className="space-y-4">
    <Collapsible className="border-b border-border pb-4"><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between px-0">Portador padrão por marketplace<ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger><CollapsibleContent className="space-y-3 pt-3"><p className="text-sm text-muted-foreground">Pedidos TikTok vão à XPM com este portador; Mercado Livre e Shopee usam a logística do próprio marketplace.</p>
      {cadastro.data?.lojas.map(l => <div key={l.codigo} className="grid gap-2 border-b border-border py-3 sm:grid-cols-[minmax(140px,1fr)_100px_minmax(240px,2fr)]"><span className="text-sm font-medium">{l.nome}</span><span className="text-sm text-muted-foreground">{l.centro_codigo ?? '—'}</span><div className="min-w-0"><PortadorSelect portadores={cadastro.data.portadores} value={l.parceiro_id} nomeAtual={l.portador_nome} limpar disabled={!permissaoPadrao.permitido || padrao.isPending} onChange={id => { void trocarPadrao(l.codigo, id); }} />{erroPadrao?.codigo === l.codigo && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-sm text-destructive">{erroPadrao.mensagem}</p>}</div></div>)}
      {!permissaoPadrao.carregando && !permissaoPadrao.permitido && <p className="text-xs text-muted-foreground">Sem permissão para alterar o portador padrão.</p>}
    </CollapsibleContent></Collapsible>
    <div className="flex flex-wrap items-center gap-3"><Input className="w-full sm:w-64" aria-label="Buscar pedidos marketplace" placeholder="Pedido, cliente ou nº marketplace" value={estado.busca} onChange={e => setEstado({ busca: e.target.value, pagina: 1 })} />
      <Select value={estado.marketplace} onValueChange={v => setEstado({ marketplace: v, pagina: 1 })}><SelectTrigger className="w-44" aria-label="Marketplace"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os marketplaces</SelectItem>{cadastro.data?.lojas.map(l => <SelectItem key={l.codigo} value={l.codigo}>{l.nome}</SelectItem>)}</SelectContent></Select>
      <Select value={estado.estagio} onValueChange={v => setEstado({ estagio: v, pagina: 1 })}><SelectTrigger className="w-48" aria-label="Estágio"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os estágios</SelectItem>{Array.from(new Set((pedidos.data ?? []).map(p => p.estagio).filter((s): s is string => !!s))).map(s => <SelectItem key={s} value={s}>{rotuloEstagio(s)}</SelectItem>)}</SelectContent></Select>
      <Label className="flex items-center gap-2"><Checkbox checked={estado.semTransportadora} onCheckedChange={v => setEstado({ semTransportadora: v === true, pagina: 1 })} />Sem transportadora</Label><Label className="flex items-center gap-2"><Checkbox checked={estado.semCusto} onCheckedChange={v => setEstado({ semCusto: v === true, pagina: 1 })} />Sem custo</Label>
    </div>
    {pedidos.isPending || cadastro.isPending ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pedidos…</div> : <div className="overflow-hidden rounded-md border border-border"><Table><TableHeader><TableRow>{['Pedido', 'Marketplace', 'Nº marketplace', 'Cliente', 'Cidade / UF', 'Valor', 'Estágio', 'CD', 'NF', 'Rastreio marketplace', 'Transportadora', 'Custo transporte', 'Comissão marketplace', 'Frete marketplace', 'Transporte'].map(c => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader><TableBody>
      {visiveis.map(p => <TableRow key={p.pedido_id} data-foco-id={p.pedido_id}><TableCell><Button variant="link" className="h-auto whitespace-nowrap p-0" onClick={() => abrirDetalhe(navigate, location, `/pedidos/${p.pedido_id}`, { foco: p.pedido_id, focoParam: 'mkt_foco', label: 'Marketplace' })}>{p.id_externo}</Button></TableCell><TableCell><Selo estado="info">{p.marketplace_nome}</Selo></TableCell><TableCell className="whitespace-nowrap">{p.numero_marketplace ?? '—'}</TableCell><TableCell className="min-w-48">{p.cliente_nome ?? '—'}</TableCell><TableCell className="whitespace-nowrap">{[p.cidade, p.uf].filter(Boolean).join(' / ') || '—'}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{dinheiro(p.valor_liquido)}</TableCell><TableCell className="whitespace-nowrap">{rotuloEstagio(p.estagio)}</TableCell><TableCell>{p.cd_codigo ?? '—'}</TableCell><TableCell>{p.nf_numero ?? '—'}</TableCell><TableCell>{p.rastreio_marketplace ?? '—'}</TableCell><TableCell className="min-w-40">{p.transportadora_nome ?? '—'}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{dinheiro(p.custo_transporte)}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{dinheiro(p.comissao_marketplace)}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{dinheiro(p.frete_marketplace)}</TableCell><TableCell><Button size="sm" variant="outline" disabled={!permissaoTransporte.permitido} title={permissaoTransporte.permitido ? 'Registrar transporte' : 'Sem permissão para registrar transporte'} onClick={() => setSelecionado(p)}><Truck className="mr-2 h-4 w-4" />Registrar transporte</Button></TableCell></TableRow>)}
      {visiveis.length === 0 && <TableRow><TableCell colSpan={15} className="py-8 text-center text-muted-foreground">Nenhum pedido encontrado.</TableCell></TableRow>}
    </TableBody></Table><RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanho} onPagina={v => setEstado({ pagina: v })} onTamanhoPagina={setTamanho} /></div>}
    {selecionado && <TransporteDialog key={selecionado.pedido_id} pedido={selecionado} portadores={cadastro.data?.portadores ?? []} onClose={() => setSelecionado(null)} />}
  </div>;
}