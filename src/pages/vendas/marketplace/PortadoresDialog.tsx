import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { formatError } from '@/lib/format-error';
import { PortadorSelect } from './PortadorSelect';
import { useCadastroMarketplace, usePortadorPadrao } from './useMarketplace';

export function PortadoresDialog({ onClose }: { onClose: () => void }) {
  const cadastro = useCadastroMarketplace();
  const mutation = usePortadorPadrao();
  const permissao = usePermissaoAcao('acao.marketplace_transportadora_padrao_set');
  const [erro, setErro] = useState('');
  const salvar = async (codigo: string, id: string | null) => {
    setErro('');
    try { await mutation.mutateAsync({ p_marketplace_codigo: codigo, p_parceiro_id: id, p_observacao: '' }); toast.success('Portador padrão atualizado.'); }
    catch (e) { setErro(formatError(e)); toast.error(formatError(e)); }
  };
  return <Dialog open onOpenChange={v => { if (!v && !mutation.isPending) onClose(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Portadores</DialogTitle><DialogDescription>Portador padrão por marketplace</DialogDescription></DialogHeader>
    <div className="space-y-3">{cadastro.data?.lojas.map(l => <div key={l.codigo} className="grid items-center gap-2 border-b py-3 sm:grid-cols-[140px_minmax(0,1fr)]"><span className="text-sm font-medium">{l.nome}</span><PortadorSelect portadores={cadastro.data.portadores} value={l.parceiro_id} nomeAtual={l.portador_nome} limpar disabled={!permissao.permitido || mutation.isPending} onChange={id => { void salvar(l.codigo, id); }} /></div>)}</div>
    {(erro || cadastro.error) && <p role="alert" className="text-sm text-destructive">{erro || formatError(cadastro.error)}</p>}
    {!permissao.carregando && !permissao.permitido && <p className="text-xs text-muted-foreground">Sem permissão para alterar portadores.</p>}
    <Button variant="link" className="justify-start px-0" asChild><Link to="/administrativo-fetely/parceiros">Cadastrar parceiro</Link></Button>
  </DialogContent></Dialog>;
}