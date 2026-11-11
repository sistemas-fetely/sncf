import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatBRL } from '@/lib/format-currency';
import { formatError } from '@/lib/format-error';
import { PortadorSelect } from './PortadorSelect';
import { useRegistrarTransporte, type PedidoMarketplace, type Portador } from './useMarketplace';
import { hojeSaoPaulo, valorTransporte } from './regras';

export function TransporteDialog({ pedido, portadores, onClose }: { pedido: PedidoMarketplace; portadores: Portador[]; onClose: () => void }) {
  const [portador, setPortador] = useState<string | null>(pedido.transportadora_id);
  const [valor, setValor] = useState('');
  const [referencia, setReferencia] = useState('');
  const [data, setData] = useState(hojeSaoPaulo());
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const mutation = useRegistrarTransporte();
  const salvar = async () => {
    if (!portador || !data) return;
    setErro('');
    try {
      await mutation.mutateAsync({ p_pedido_id: pedido.pedido_id, p_parceiro_id: portador, p_valor: valorTransporte(valor), p_referencia: referencia, p_data_servico: data, p_observacao: observacao });
      toast.success('Transporte registrado.');
      onClose();
    } catch (e) { const mensagem = formatError(e); setErro(mensagem); toast.error(mensagem); }
  };
  return <Dialog open onOpenChange={v => { if (!v && !mutation.isPending) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Registrar transporte · {pedido.id_externo}</DialogTitle><DialogDescription>{pedido.cliente_nome}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void salvar(); }}>
      <div className="space-y-2"><Label>Transportadora / portador</Label><PortadorSelect portadores={portadores} value={portador} nomeAtual={portador === pedido.transportadora_id ? pedido.transportadora_nome : null} onChange={setPortador} disabled={mutation.isPending} /><Button variant="link" className="h-auto p-0" asChild><Link to="/administrativo-fetely/parceiros">Cadastro de Parceiros</Link></Button></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="transporte-valor">Valor (R$, opcional)</Label><Input id="transporte-valor" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} disabled={mutation.isPending} /></div><div className="space-y-2"><Label htmlFor="transporte-data">Data do serviço</Label><Input id="transporte-data" type="date" required value={data} onChange={e => setData(e.target.value)} disabled={mutation.isPending} /></div></div>
      <div className="space-y-2"><Label htmlFor="transporte-ref">Referência (rastreio / recibo, opcional)</Label><Input id="transporte-ref" value={referencia} onChange={e => setReferencia(e.target.value)} disabled={mutation.isPending} /></div>
      <div className="space-y-2"><Label htmlFor="transporte-obs">Observação</Label><Textarea id="transporte-obs" value={observacao} onChange={e => setObservacao(e.target.value)} disabled={mutation.isPending} /></div>
      <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">Transportes registrados</h3>{(pedido.transportes ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum transporte registrado.</p> : <ul className="divide-y text-sm">{pedido.transportes?.map(t => <li key={t.id} className="space-y-1 py-2"><div className="flex justify-between gap-3"><span>{t.transportadora}</span><span className="shrink-0 tabular-nums">{t.valor == null ? '—' : formatBRL(t.valor)}</span></div><div className="text-xs text-muted-foreground">{[t.origem, t.data, t.referencia].filter(Boolean).join(' · ')}</div></li>)}</ul>}</section>
      {erro && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{erro}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!portador || !data || mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}Registrar transporte</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}