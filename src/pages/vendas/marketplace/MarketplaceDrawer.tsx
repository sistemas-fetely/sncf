import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Truck, RotateCcw, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/ui/selo';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { useNivel } from '@/hooks/useNivel';
import { abrirDetalhe } from '@/lib/navegacao/abrirDetalhe';
import { formatBRL, formatDateBR } from '@/lib/format-currency';
import { podeAbrirDevolucao, podeIrMesaSp } from './regras';
import type { PedidoMarketplace } from './useMarketplace';
const dinheiro = (v: number | null) => v == null ? '—' : formatBRL(v);
function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) { return <section className="space-y-2"><h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</h3>{children}</section>; }
function Linha({ label, valor }: { label: string; valor: ReactNode }) { return <div className="flex justify-between gap-4 text-xs"><span className="text-muted-foreground">{label}</span><span className="min-w-0 break-words text-right">{valor || '—'}</span></div>; }
export function MarketplaceDrawer({ pedido: p, onClose, onTransporte, onDevolucao }: { pedido: PedidoMarketplace; onClose: () => void; onTransporte: () => void; onDevolucao: () => void }) {
  const navigate = useNavigate(); const location = useLocation();
  const transporte = usePermissaoAcao('acao.pedido_transporte_registrar');
  const { temNivel } = useNivel();
  const ir = (url: string) => abrirDetalhe(navigate, location, url, { foco: p.pedido_id, label: 'Pedidos Marketplace' });
  return <Sheet open onOpenChange={v => { if (!v) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{p.id_externo}</SheetTitle><SheetDescription>{p.cliente_nome}</SheetDescription></SheetHeader>
    <div className="space-y-6 py-6"><Selo estado="info">{p.marketplace_nome}</Selo>
      <Bloco titulo="Pedido"><Linha label="Nº marketplace" valor={p.numero_marketplace} /><Linha label="Pedido Bling" valor={p.bling_numero} /><Linha label="Data" valor={p.data_pedido ? formatDateBR(p.data_pedido) : null} /><Linha label="CD" valor={p.cd_nome ?? p.cd_codigo} /><Linha label="Fase" valor={p.estagio_rotulo} /><Linha label="Subetapa" valor={p.subetapa} /><Linha label="Responsável" valor={p.area_responsavel} /><Linha label="Próxima ação" valor={p.proxima_acao} /><Linha label="Horas na fase" valor={p.horas_no_estagio} /><Linha label="NF" valor={p.nf_numero} /><Linha label="Faturado em" valor={p.faturado_em ? formatDateBR(p.faturado_em) : null} /><Linha label="Expedição XPM" valor={p.xpm_expedicao_codigo} /><Button variant="link" className="h-auto px-0" onClick={() => ir(`/pedidos/${p.pedido_id}`)}><ExternalLink className="mr-2 h-3.5 w-3.5" />Abrir pedido</Button></Bloco>
      <Bloco titulo="Entrega"><Linha label="Rastreio" valor={p.rastreio_codigo} /><Linha label="Serviço" valor={p.servico_marketplace} /><Linha label="Status" valor={p.rastreio_status} /><Linha label="Transportadora" valor={p.transportadora_nome} /><Linha label="Entregue em" valor={p.entregue_em ? formatDateBR(p.entregue_em) : null} /></Bloco>
      <Bloco titulo="Financeiro do canal"><Linha label="Valor" valor={dinheiro(p.valor_liquido)} /><Linha label="Comissão marketplace" valor={dinheiro(p.comissao_marketplace)} /><Linha label="Frete marketplace" valor={dinheiro(p.frete_marketplace)} /><Linha label="Custo transporte" valor={dinheiro(p.custo_transporte)} /><Linha label="Líquido estimado" valor={dinheiro(p.liquido_estimado)} /></Bloco>
      <Bloco titulo="Transportes registrados">{p.transportes?.length ? <ul className="divide-y">{p.transportes.map(t => <li key={t.id} className="space-y-1 py-2"><Linha label={t.transportadora} valor={dinheiro(t.valor)} /><p className="text-xs text-muted-foreground">{[t.data, t.referencia, t.origem].filter(Boolean).join(' · ')}</p></li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhum transporte registrado.</p>}</Bloco>
      {p.devolucao_numero && <Bloco titulo="Devolução"><Linha label="Número" valor={p.devolucao_numero} /><Linha label="Status" valor={p.devolucao_status} /><Button variant="link" className="px-0" onClick={() => ir('/devolucoes?canal=b2c')}>Devoluções e Correções</Button></Bloco>}
      {p.alerta != null && <Bloco titulo="Alerta"><p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">{p.alerta}</p></Bloco>}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={!transporte.permitido} title={transporte.permitido ? undefined : 'Sem permissão para registrar transporte'} onClick={onTransporte}><Truck className="mr-2 h-4 w-4" />Registrar transporte</Button>
        {podeAbrirDevolucao(p) && <Button variant="outline" disabled={!temNivel(4)} onClick={onDevolucao}><RotateCcw className="mr-2 h-4 w-4" />Abrir devolução</Button>}
        {podeIrMesaSp(p) && <Button variant="outline" onClick={() => ir('/logistica/expedicao-sp')}><ArrowRight className="mr-2 h-4 w-4" />Ir para a Mesa SP</Button>}
      </div>
    </div>
  </SheetContent></Sheet>;
}