import { useState } from 'react';
import { Loader2, PackageSearch, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Selo } from '@/components/ui/selo';
import { CodProduto } from '@/components/produto/CodProduto';
import { usePermissaoAcao } from '@/hooks/usePermissaoAcao';
import { fmtDataHora } from '@/lib/data';
import { formatError } from '@/lib/format-error';
import { useAguardarItemMesa, useItemChegouMesa } from './useMesaSp';
import { esperaItemMesa, faltantesValidos, itensFaltantesMesa, itensPedidoPorSku } from './aguardandoItem';
import type { EventoMesa, ItemPedidoMesa, PedidoMesa } from './tipos';

export function SeloItensFaltantes({ pedido }: { pedido: PedidoMesa }) {
  if (pedido.etapa !== 'aguardando_item') return null;
  return <span className="block space-y-1">
    {itensFaltantesMesa(pedido.itens_faltando).map(i => <span key={i.sku} className="block break-all text-xs">{i.sku} × {i.quantidade}</span>)}
    {pedido.item_pode_ter_chegado && <Selo estado="warning">Item chegou?</Selo>}
  </span>;
}

export function AguardandoItemMesa({ pedido, itens, eventos, bloqueado, carregando, erroItens }: {
  pedido: PedidoMesa; itens: ItemPedidoMesa[]; eventos: EventoMesa[]; bloqueado: boolean; carregando: boolean; erroItens: unknown;
}) {
  const { permitido } = usePermissaoAcao('acao.expedicao_sp_operar');
  const aguardar = useAguardarItemMesa();
  const chegou = useItemChegouMesa();
  const [aberto, setAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const pedidoItens = itensPedidoPorSku(itens);
  const faltantes = Object.entries(selecionados).map(([sku, quantidade]) => ({ sku, quantidade }));
  const espera = esperaItemMesa(eventos);
  const pendente = aguardar.isPending || chegou.isPending;
  if (pedido.etapa === 'aguardando_item') return <Card><CardContent className="space-y-3 p-4">
    <p className="text-sm font-medium">{pedido.etapa_rotulo ?? pedido.etapa}</p>
    <ul className="space-y-2">{itensFaltantesMesa(pedido.itens_faltando).map(i => <li key={i.sku} className="text-sm"><CodProduto chave={i.sku} /> <span className="break-words">{i.nome} · {i.quantidade} un</span></li>)}</ul>
    <p className="break-words text-sm">Motivo: {espera.motivo || '—'}</p>
    <p className="text-xs text-muted-foreground">Desde {fmtDataHora(espera.desde ?? pedido.entrou_em)}</p>
    {pedido.item_pode_ter_chegado && <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong"><Selo estado="warning">Item chegou?</Selo><p className="mt-1">O saldo físico do CD subiu para todos os itens faltantes.</p></div>}
    {permitido && <><Label htmlFor="mesa-item-observacao">Observação (opcional)</Label><Textarea id="mesa-item-observacao" value={observacao} onChange={e => setObservacao(e.target.value)} disabled={pendente} />
      {chegou.error && <p role="alert" className="text-sm text-destructive">{formatError(chegou.error)}</p>}
      <Button className="h-auto whitespace-normal text-left" disabled={bloqueado || pendente} onClick={async () => {
        try { await chegou.mutateAsync({ p_pedido_id: pedido.id, p_observacao: observacao.trim() || null }); } catch { /* mutation displays database error */ }
      }}>{chegou.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}Item chegou — voltar para separação</Button></>}
  </CardContent></Card>;
  if (!permitido || !['separacao','conferencia'].includes(pedido.etapa)) return null;
  return <>
    <Button variant="outline" size="sm" disabled={bloqueado || carregando || !!erroItens || pendente} onClick={() => { setSelecionados({}); setMotivo(''); aguardar.reset(); setAberto(true); }}><PackageSearch />Faltou item</Button>
    <Dialog open={aberto} onOpenChange={v => { if (!pendente) setAberto(v); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Faltou item · {pedido.id_externo}</DialogTitle><DialogDescription>A separação e as reservas permanecem intactas enquanto o pedido aguarda o item no CD.</DialogDescription></DialogHeader>
      <div className="space-y-3">{pedidoItens.map(i => <div key={i.sku} className="flex items-start gap-3 rounded-md border p-3">
        <Checkbox id={`falta-${i.sku}`} checked={i.sku in selecionados} disabled={pendente} onCheckedChange={v => setSelecionados(a => { const n = { ...a }; if (v === true) n[i.sku] = i.quantidade; else delete n[i.sku]; return n; })} />
        <Label htmlFor={`falta-${i.sku}`} className="min-w-0 flex-1 space-y-1 leading-normal"><CodProduto chave={i.sku} /><span className="block break-words">{i.nome}</span></Label>
        <Input type="number" aria-label={`Quantidade faltante ${i.sku}`} className="w-24 shrink-0" min={0} max={i.quantidade} step="any" disabled={!(i.sku in selecionados) || pendente} value={selecionados[i.sku] ?? i.quantidade} onChange={e => setSelecionados(a => ({ ...a, [i.sku]: Number(e.target.value) }))} />
      </div>)}</div>
      <Label htmlFor="mesa-falta-motivo">Motivo (mínimo 5 caracteres)</Label><Textarea id="mesa-falta-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={pendente} />
      {aguardar.error && <p role="alert" className="text-sm text-destructive">{formatError(aguardar.error)}</p>}
      <DialogFooter><Button variant="outline" disabled={pendente} onClick={() => setAberto(false)}>Voltar</Button><Button disabled={bloqueado || pendente || !faltantesValidos(faltantes,pedidoItens,motivo)} onClick={async () => {
        try { await aguardar.mutateAsync({ p_pedido_id: pedido.id, p_itens: faltantes, p_motivo: motivo.trim() }); setAberto(false); } catch { /* mutation displays database error */ }
      }}>{aguardar.isPending && <Loader2 className="animate-spin" />}Confirmar espera</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}