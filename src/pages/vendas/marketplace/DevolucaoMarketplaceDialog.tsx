import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNivel } from '@/hooks/useNivel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DesfechoDevolucaoCampo, MotivoDevolucaoCampos } from '@/components/devolucao/MotivoDevolucaoCampos';
import { formatError } from '@/lib/format-error';
import { exigirSucesso, podeAbrirDevolucao, valorTransporte } from './regras';
import type { PedidoMarketplace } from './useMarketplace';

export function DevolucaoMarketplaceDialog({ pedido, onClose }: { pedido: PedidoMarketplace; onClose: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [desfecho, setDesfecho] = useState('reembolso');
  const [valor, setValor] = useState('');
  const [nf, setNf] = useState('');
  const [erro, setErro] = useState('');
  const [numero, setNumero] = useState('');
  const qc = useQueryClient();
  const { temNivel } = useNivel();
  const dados = useQuery({ queryKey: ['marketplace', 'devolucao', pedido.pedido_id], queryFn: async () => {
    const [motivos, itens] = await Promise.all([
      supabase.from('parametros').select('valor,label').eq('categoria', 'devolucao_motivo').eq('ativo', true).order('ordem'),
      supabase.from('pedidos').select('itens_json').eq('id', pedido.pedido_id).single(),
    ]);
    if (motivos.error) throw motivos.error;
    if (itens.error) throw itens.error;
    return { motivos: motivos.data, itens: itens.data.itens_json };
  } });
  const mutation = useMutation({ mutationFn: async () => {
    if (!temNivel(4) || !podeAbrirDevolucao(pedido)) throw new Error('Devolução não permitida para este pedido.');
    if (motivo.trim().length < 5) throw new Error('Motivo obrigatório (mínimo 5 caracteres).');
    if (!dados.data || !Array.isArray(dados.data.itens) || !dados.data.itens.length) throw new Error('Pedido sem itens disponíveis para devolução.');
    const { data, error } = await (supabase as any).rpc('registrar_devolucao_marketplace', {
      p_pedido_id: pedido.pedido_id, p_motivo: motivo.trim(), p_motivo_codigo: codigo || null,
      p_desfecho: desfecho, p_valor_credito: valorTransporte(valor), p_nf_devolucao: nf.trim() || null, p_itens: dados.data.itens,
    });
    if (error) throw error;
    exigirSucesso(data);
    return data as { devolucao_numero?: string };
  }, onSuccess: async () => { await qc.invalidateQueries(); } });
  const salvar = async () => { setErro(''); try { const r = await mutation.mutateAsync(); setNumero(r.devolucao_numero ?? 'Registrada'); toast.success('Devolução aberta.'); } catch (e) { setErro(formatError(e)); toast.error(formatError(e)); } };
  return <Dialog open onOpenChange={v => { if (!v && !mutation.isPending) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Abrir devolução · {pedido.id_externo}</DialogTitle><DialogDescription>{pedido.cliente_nome}</DialogDescription></DialogHeader>
    {numero ? <div className="space-y-4"><p>{numero}</p><Button asChild><Link to="/devolucoes?canal=b2c">Devoluções e Correções</Link></Button></div> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void salvar(); }}>
      <MotivoDevolucaoCampos codigo={codigo} onCodigo={setCodigo} motivo={motivo} onMotivo={setMotivo} opcoes={dados.data?.motivos.map(m => <SelectItem key={m.valor} value={m.valor}>{m.label}</SelectItem>)} />
      <DesfechoDevolucaoCampo value={desfecho} onChange={setDesfecho}><SelectItem value="reembolso">Reembolso</SelectItem><SelectItem value="troca">Troca</SelectItem><SelectItem value="haver">Haver (crédito)</SelectItem><SelectItem value="nenhum">A definir</SelectItem></DesfechoDevolucaoCampo>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="dev-credito">Valor do crédito (opcional)</Label><Input id="dev-credito" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="dev-nf">NF de devolução (opcional)</Label><Input id="dev-nf" value={nf} onChange={e => setNf(e.target.value)} /></div></div>
      <p className="text-xs text-muted-foreground">{Array.isArray(dados.data?.itens) ? dados.data.itens.length : 0} itens do pedido</p>
      {(erro || dados.error) && <p role="alert" className="text-sm text-destructive">{erro || formatError(dados.error)}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" disabled={mutation.isPending || !dados.data || motivo.trim().length < 5 || !temNivel(4)}>Abrir devolução</Button></DialogFooter>
    </form>}
  </DialogContent></Dialog>;
}