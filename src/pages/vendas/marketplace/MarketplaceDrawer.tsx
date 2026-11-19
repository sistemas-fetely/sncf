import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Truck, RotateCcw, ArrowRight } from 'lucide-react';
import { PedidoCanalDrawer, BlocoPedidoCanal as Bloco, LinhaPedidoCanal } from '@/components/vendas/PedidoCanalDrawer';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/ui/selo';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { useNivel } from '@/hooks/useNivel';
import { abrirDetalhe } from '@/lib/navegacao/abrirDetalhe';
import { formatBRL, formatDateBR } from '@/lib/format-currency';
import { podeAbrirDevolucao, podeIrMesaSp, temAlertaMarketplace } from './regras';
import type { PedidoMarketplace } from './useMarketplace';
import { estimativaDifere, type RecebivelMarketplacePedido } from '@/lib/financeiro/recebivelMarketplace';
import { StatusRecebivelMarketplace } from '@/components/financeiro/RecebiveisMarketplaceTab';
const dinheiro = (v: number | null) => v == null ? '—' : formatBRL(v);
function Linha({ label, valor }: { label: string; valor: ReactNode }) { return <LinhaPedidoCanal rotulo={label}>{valor ?? '—'}</LinhaPedidoCanal>; }
export function MarketplaceDrawer({ pedido: p, recebivel, onClose, onTransporte, onDevolucao }: { pedido: PedidoMarketplace; recebivel?: RecebivelMarketplacePedido; onClose: () => void; onTransporte: () => void; onDevolucao: () => void }) {
  const navigate = useNavigate(); const location = useLocation();
  const transporte = usePermissaoAcao('acao.pedido_transporte_registrar');
  const { temNivel } = useNivel();
  const ir = (url: string) => abrirDetalhe(navigate, location, url, { foco: p.pedido_id, label: 'Pedidos Marketplace' });
  return <PedidoCanalDrawer open onOpenChange={v => { if (!v) onClose(); }}
    titulo={<>{p.id_externo} <Selo estado="info">{p.marketplace_nome}</Selo></>}
    descricao={<>{p.cliente_nome ?? '—'} · {formatDateBR(p.data_pedido)} · {p.estagio_rotulo ?? '—'}</>}
  >
      <Bloco titulo="Pedido"><Linha label="Nº marketplace" valor={p.numero_marketplace} /><Linha label="Pedido Bling" valor={p.bling_numero} /><Linha label="Data" valor={p.data_pedido ? formatDateBR(p.data_pedido) : null} /><Linha label="CD" valor={p.cd_nome ?? p.cd_codigo} /><Linha label="Estágio" valor={p.estagio_rotulo} />{p.agendado_para && <Linha label="Liberação prevista" valor={formatDateBR(p.agendado_para)} />}<Linha label="Subetapa" valor={p.subetapa} /><Linha label="Dono" valor={p.area_responsavel} /><Linha label="Próxima ação" valor={p.proxima_acao} /><Linha label="Horas no estágio" valor={p.horas_no_estagio} /><Linha label="NF" valor={p.nf_numero} /><Linha label="Faturado em" valor={p.faturado_em ? formatDateBR(p.faturado_em) : null} /><Linha label="Expedição XPM" valor={p.xpm_expedicao_codigo} /><Button variant="link" className="h-auto px-0" onClick={() => ir(`/pedidos/${p.pedido_id}`)}><ExternalLink className="mr-2 h-3.5 w-3.5" />Abrir pedido</Button></Bloco>
      <Bloco titulo="Entrega"><Linha label="Rastreio" valor={p.rastreio_codigo} /><Linha label="Serviço" valor={p.servico_marketplace} /><Linha label="Status" valor={p.rastreio_status} /><Linha label="Transportadora" valor={p.transportadora_nome} /><Linha label="Entregue em" valor={p.entregue_em ? formatDateBR(p.entregue_em) : null} /></Bloco>
      <Bloco titulo="Financeiro do canal"><Linha label="Valor" valor={dinheiro(p.valor_liquido)} /><Linha label="Comissão marketplace" valor={<>{dinheiro(recebivel?.mp_comissao ?? p.comissao_marketplace)}{estimativaDifere(recebivel?.mp_comissao, p.comissao_marketplace) && <span className="block text-muted-foreground">Bling estimou {dinheiro(p.comissao_marketplace)}</span>}</>} /><Linha label="Frete marketplace" valor={<>{dinheiro(recebivel?.mp_frete ?? p.frete_marketplace)}{estimativaDifere(recebivel?.mp_frete, p.frete_marketplace) && <span className="block text-muted-foreground">Bling estimou {dinheiro(p.frete_marketplace)}</span>}</>} /><Linha label="Custo transporte" valor={dinheiro(p.custo_transporte)} />{!recebivel && <Linha label="Líquido estimado" valor={dinheiro(p.liquido_estimado)} />}</Bloco>
      {recebivel && <Bloco titulo="Mercado Pago"><StatusRecebivelMarketplace status={recebivel.mp_status} /><Linha label="Bruto" valor={dinheiro(recebivel.mp_bruto)} /><Linha label="Parcelamento" valor={dinheiro(recebivel.mp_parcelamento)} /><Linha label="Impostos" valor={dinheiro(recebivel.mp_impostos)} /><Linha label="Líquido a receber" valor={<>{dinheiro(recebivel.mp_liquido)}{estimativaDifere(recebivel.mp_liquido, p.liquido_estimado) && <span className="block text-muted-foreground">Bling estimou {dinheiro(p.liquido_estimado)}</span>}</>} /><Linha label={recebivel.mp_status === 'liberado' ? 'Liberado em' : 'Liberação prevista'} valor={formatDateBR(recebivel.mp_status === 'liberado' ? recebivel.mp_liberado_em : recebivel.mp_liberacao_prevista)} /></Bloco>}
      <Bloco titulo="Transportes registrados">{p.transportes?.length ? <ul className="divide-y">{p.transportes.map(t => <li key={t.id} className="space-y-1 py-2"><Linha label={t.transportadora} valor={dinheiro(t.valor)} /><p className="text-xs text-muted-foreground">{[t.data, t.referencia, t.origem].filter(Boolean).join(' · ')}</p></li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhum transporte registrado.</p>}</Bloco>
      {p.devolucao_numero && <Bloco titulo="Devolução"><Linha label="Número" valor={p.devolucao_numero} /><Linha label="Status" valor={p.devolucao_status} /><Button variant="link" className="px-0" onClick={() => ir('/devolucoes?canal=b2c')}>Devoluções e Correções</Button></Bloco>}
      {temAlertaMarketplace(p) && <Bloco titulo="Alerta"><p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">{p.alerta}</p></Bloco>}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={!transporte.permitido} title={transporte.permitido ? undefined : 'Sem permissão para registrar transporte'} onClick={onTransporte}><Truck className="mr-2 h-4 w-4" />Registrar transporte</Button>
        {podeAbrirDevolucao(p) && <Button variant="outline" disabled={!temNivel(4)} onClick={onDevolucao}><RotateCcw className="mr-2 h-4 w-4" />Abrir devolução</Button>}
        {podeIrMesaSp(p) && <Button variant="outline" onClick={() => ir('/logistica/expedicao-sp')}><ArrowRight className="mr-2 h-4 w-4" />Ir para a Mesa SP</Button>}
      </div>
  </PedidoCanalDrawer>;
}