import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { formatError } from '@/lib/format-error';
import { amanhaMarketplace, dataAgendamentoValida } from './regras';
import { useAgendarMarketplace, type PedidoMarketplace } from './useMarketplace';

export function AgendarMarketplaceDialog({ pedido, onClose }: { pedido: PedidoMarketplace; onClose: () => void }) {
  const [data, setData] = useState<Date | undefined>(pedido.agendado_para ? parseISO(pedido.agendado_para) : undefined);
  const [calendario, setCalendario] = useState(false);
  const [erro, setErro] = useState('');
  const mutation = useAgendarMarketplace();
  const valor = data ? format(data, 'yyyy-MM-dd') : '';
  const confirmar = async () => {
    if (!dataAgendamentoValida(valor) || mutation.isPending) return;
    setErro('');
    try {
      await mutation.mutateAsync({ pedidoId: pedido.pedido_id, data: valor });
      toast.success(`Pedido agendado para ${format(parseISO(valor), 'dd/MM/yyyy')}`);
      onClose();
    } catch (e) { const mensagem = formatError(e); setErro(mensagem); toast.error(mensagem); }
  };
  return <Dialog open onOpenChange={v => { if (!v && !mutation.isPending) onClose(); }}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>{pedido.agendado_para ? 'Alterar data' : 'Agendar'} · {pedido.id_externo}</DialogTitle><DialogDescription>{pedido.cliente_nome}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void confirmar(); }}>
      <div className="space-y-2"><Label htmlFor="marketplace-agendado-para">Liberação prevista</Label><Popover open={calendario} onOpenChange={setCalendario}><PopoverTrigger asChild><Button id="marketplace-agendado-para" type="button" variant="outline" disabled={mutation.isPending} className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{data ? format(data, 'dd/MM/yyyy') : 'Selecionar data'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" locale={ptBR} selected={data} defaultMonth={data ?? parseISO(amanhaMarketplace())} onSelect={v => { setData(v); setCalendario(false); }} disabled={{ before: parseISO(amanhaMarketplace()) }} initialFocus className="pointer-events-auto p-3" /></PopoverContent></Popover></div>
      {erro && <p role="alert" className="break-words text-sm text-destructive">{erro}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" disabled={!dataAgendamentoValida(valor) || mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}