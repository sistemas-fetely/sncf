import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Truck, RotateCcw, ArrowRight, ChevronDown, Package } from 'lucide-react';
import { PedidoCanalDrawer, BlocoPedidoCanal as Bloco, LinhaPedidoCanal } from '@/components/vendas/PedidoCanalDrawer';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/ui/selo';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { useNivel } from '@/hooks/useNivel';
import { useImagensPorCod } from '@/hooks/useImagemProduto';
import { abrirDetalhe } from '@/lib/navegacao/abrirDetalhe';
import { formatBRL, formatDateBR } from '@/lib/format-currency';
import { podeAbrirDevolucao, podeIrMesaSp, temAlertaMarketplace } from './regras';
import { useDetalheMarketplace, type PedidoMarketplace } from './useMarketplace';
import { estimativaDifere, type RecebivelMarketplacePedido } from '@/lib/financeiro/recebivelMarketplace';
import { StatusRecebivelMarketplace } from '@/components/financeiro/RecebiveisMarketplaceTab';

const dinheiro = (v: number | null | undefined) => v == null ? '—' : formatBRL(v);
const vazio = (v: unknown) => v == null || v === '' || v === '—';
function Linha({ label, valor }: { label: string; valor: ReactNode }) {
  if (vazio(valor)) return null;
  return <LinhaPedidoCanal rotulo={label}>{valor}</LinhaPedidoCanal>;
}
function Valor({ v, bling }: { v: number | null | undefined; bling?: number | null }) {
  return <>{bling !== undefined && estimativaDifere(v, bling) && <span className="mr-2 text-xs text-muted-foreground">Bling estimou {dinheiro(bling)}</span>}{dinheiro(v)}</>;
}
function Dobra({ resumo, aberto, children }: { resumo: ReactNode; aberto: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(aberto);
  return <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
      <span className="truncate">{resumo}</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-1 border-t px-3 py-2">{children}</CollapsibleContent>
  </Collapsible>;
}

export function MarketplaceDrawer({ pedido: p, recebivel, onClose, onTransporte, onDevolucao }: { pedido: PedidoMarketplace; recebivel?: RecebivelMarketplacePedido; onClose: () => void; onTransporte: () => void; onDevolucao: () => void }) {
  const navigate = useNavigate(); const location = useLocation();
  const transporte = usePermissaoAcao('acao.pedido_transporte_registrar');
  const { temNivel } = useNivel();
  const detalhe = useDetalheMarketplace(p.pedido_id);
  const itens = detalhe.data?.itens ?? [];
  const fotos = useImagensPorCod(itens.map(i => i.cod_cadastro));
  const ir = (url: string) => abrirDetalhe(navigate, location, url, { foco: p.pedido_id, label: 'Pedidos Marketplace' });

  const sub = p.subetapa?.trim() || null;
  const postar = p.agendado_para && !(sub && /\d{2}\/\d{2}/.test(sub)) ? `Postar em ${formatDateBR(p.agendado_para)}` : null;
  const frase = [p.estagio_rotulo, sub, postar].filter(Boolean).join(' · ');
  const dono = !p.area_responsavel || p.area_responsavel.toLowerCase() === 'nenhuma' ? 'sem dono' : p.area_responsavel;
  const nf = p.nf_numero ? `NF ${p.nf_numero}${p.faturado_em ? ` faturada em ${formatDateBR(p.faturado_em)}` : ''}` : null;
  const linha3 = [p.cd_nome ?? p.cd_codigo, nf, dono].filter(Boolean).join(' · ');

  const bruto = detalhe.data?.valor_bruto ?? p.valor_bruto ?? null;
  const frete = detalhe.data?.valor_frete ?? p.valor_frete ?? null;
  const comissao = recebivel ? recebivel.mp_comissao : p.comissao_marketplace;
  const freteMkt = recebivel ? recebivel.mp_frete : p.frete_marketplace;
  const dataMp = recebivel ? (recebivel.mp_status === 'liberado' ? recebivel.mp_liberado_em : recebivel.mp_liberacao_prevista) : null;
  const naoZero = (v: number | null | undefined) => v != null && Number(v) !== 0;
  const pos = (v: number | null | undefined) => v == null ? null : Math.abs(Number(v));

  const temRastreio = !!p.rastreio_codigo;
  const custoTransp = p.custo_transporte ?? (p.transportes ?? []).reduce((s, t) => s + Number(t.valor ?? 0), 0);

  return <PedidoCanalDrawer open onOpenChange={v => { if (!v) onClose(); }}
    titulo={<>{p.id_externo} <Selo estado="info">{p.marketplace_nome}</Selo></>}
    descricao={[p.cliente_nome, p.data_pedido ? formatDateBR(p.data_pedido) : null].filter(Boolean).join(' · ')}
  >
    <div className="space-y-1 rounded-md border border-info/30 bg-info/10 p-3">
      <div className="flex items-start justify-between gap-3"><p className="font-medium">{frase || '—'}</p>{p.horas_no_estagio != null && <span className="shrink-0 text-sm text-muted-foreground">{p.horas_no_estagio} h</span>}</div>
      {p.proxima_acao && <p className="text-sm">{p.proxima_acao}</p>}
      {linha3 && <p className="text-xs text-muted-foreground">{linha3}</p>}
    </div>
    {temAlertaMarketplace(p) && <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">{p.alerta}</p>}

    <Bloco titulo={`Itens (${detalhe.isLoading ? '…' : itens.length})`}>
      {detalhe.isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        : detalhe.error ? <p className="text-sm text-destructive">{(detalhe.error as Error).message}</p>
        : !itens.length ? <p className="text-xs text-muted-foreground">Itens não encontrados</p>
        : <ul className="divide-y">{itens.map(i => { const foto = i.cod_cadastro ? fotos.data?.get(i.cod_cadastro)?.imagem_url : undefined; return <li key={i.id} className="flex items-center gap-3 py-2">
          {foto ? <img src={foto} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted"><Package className="h-4 w-4 text-muted-foreground" /></div>}
          <div className="min-w-0 flex-1"><p className="truncate text-sm">{i.descricao}</p><p className="text-xs text-muted-foreground">{[i.cod_cadastro ?? i.sku, `${Number(i.quantidade).toLocaleString('pt-BR')} × ${formatBRL(Number(i.valor_unitario))}`].filter(Boolean).join(' · ')}</p></div>
          <span className="shrink-0 text-sm font-medium">{dinheiro(i.subtotal)}</span></li>; })}</ul>}
    </Bloco>

    <Bloco titulo={<span className="flex flex-wrap items-center gap-2">Resultado{recebivel && <><StatusRecebivelMarketplace status={recebivel.mp_status} />{dataMp && <span className="text-xs font-normal text-muted-foreground">{recebivel.mp_status === 'liberado' ? 'liberado' : 'a liberar'} em {formatDateBR(dataMp)}</span>}</>}</span>}>
      <Linha label="Cliente pagou" valor={p.valor_liquido == null ? null : <span className="text-right">{dinheiro(p.valor_liquido)}{(bruto != null || frete != null) && <span className="block text-xs text-muted-foreground">produtos {dinheiro(bruto)} + frete {dinheiro(frete)}</span>}</span>} />
      {recebivel && <Linha label="Venda (bruto MP)" valor={dinheiro(recebivel.mp_bruto)} />}
      {comissao != null && <Linha label="− Comissão" valor={<Valor v={pos(comissao)} bling={recebivel ? pos(p.comissao_marketplace) : undefined} />} />}
      {freteMkt != null && <Linha label="− Frete marketplace" valor={<Valor v={pos(freteMkt)} bling={recebivel ? pos(p.frete_marketplace) : undefined} />} />}
      {recebivel && naoZero(recebivel.mp_parcelamento) && <Linha label="− Parcelamento" valor={dinheiro(pos(recebivel.mp_parcelamento))} />}
      {recebivel && naoZero(recebivel.mp_impostos) && <Linha label="− Impostos" valor={dinheiro(pos(recebivel.mp_impostos))} />}
      <div className="font-semibold"><Linha label={recebivel ? 'Líquido a receber' : 'Líquido estimado'} valor={recebivel ? <Valor v={recebivel.mp_liquido} bling={p.liquido_estimado} /> : dinheiro(p.liquido_estimado)} /></div>
    </Bloco>

    <Dobra aberto={temRastreio} resumo={<>Entrega · {[p.servico_marketplace, temRastreio ? (p.rastreio_status ?? p.rastreio_codigo) : 'sem rastreio ainda'].filter(Boolean).join(' · ')}</>}>
      <Linha label="Rastreio" valor={p.rastreio_codigo} />
      <Linha label="Transportadora" valor={p.transportadora_nome} />
      <Linha label="Expedição XPM" valor={p.xpm_expedicao_codigo} />
      <Linha label="Entregue em" valor={p.entregue_em ? formatDateBR(p.entregue_em) : null} />
      <p className="pt-2 text-xs font-medium text-muted-foreground">Transportes registrados</p>
      {p.transportes?.length ? <><ul className="divide-y">{p.transportes.map(t => <li key={t.id} className="space-y-1 py-2"><LinhaPedidoCanal rotulo={t.transportadora}>{dinheiro(t.valor)}</LinhaPedidoCanal><p className="text-xs text-muted-foreground">{[t.data, t.referencia, t.origem].filter(Boolean).join(' · ')}</p></li>)}</ul><div className="font-medium"><LinhaPedidoCanal rotulo="Custo transporte">{dinheiro(custoTransp)}</LinhaPedidoCanal></div></> : <p className="text-xs text-muted-foreground">Nenhum transporte registrado.</p>}
    </Dobra>

    {p.devolucao_numero && <Bloco titulo="Devolução"><Linha label="Número" valor={p.devolucao_numero} /><Linha label="Status" valor={p.devolucao_status} /><Button variant="link" className="px-0" onClick={() => ir('/devolucoes?canal=b2c')}>Devoluções e Correções</Button></Bloco>}

    <Dobra aberto={false} resumo={['Referências', p.numero_marketplace && `${p.marketplace_codigo?.toUpperCase() ?? p.marketplace_nome} ${p.numero_marketplace}`, p.bling_numero && `Bling ${p.bling_numero}`].filter(Boolean).join(' · ')}>
      <Linha label="Nº marketplace" valor={p.numero_marketplace} />
      <Linha label="Pedido Bling" valor={p.bling_numero} />
      <Linha label="Data" valor={p.data_pedido ? formatDateBR(p.data_pedido) : null} />
    </Dobra>

    <div className="flex flex-wrap gap-2 border-t pt-4">
      <Button variant="outline" onClick={() => ir(`/pedidos/${p.pedido_id}`)}><ExternalLink className="mr-2 h-4 w-4" />Abrir pedido</Button>
      <Button variant="outline" disabled={!transporte.permitido} title={transporte.permitido ? undefined : 'Sem permissão para registrar transporte'} onClick={onTransporte}><Truck className="mr-2 h-4 w-4" />Registrar transporte</Button>
      {podeAbrirDevolucao(p) && <Button variant="outline" disabled={!temNivel(4)} onClick={onDevolucao}><RotateCcw className="mr-2 h-4 w-4" />Abrir devolução</Button>}
      {podeIrMesaSp(p) && <Button variant="outline" onClick={() => ir('/logistica/expedicao-sp')}><ArrowRight className="mr-2 h-4 w-4" />Ir para a Mesa SP</Button>}
    </div>
  </PedidoCanalDrawer>;
}
