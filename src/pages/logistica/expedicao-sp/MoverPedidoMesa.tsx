import { useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";
import { podeConfirmarMovimento, respostasMovimento, type TransicaoMesa } from "./moverMesa";
import { useMoverMesaSp, useTransicoesMesaSp } from "./useMoverMesaSp";

export function ConfirmacaoMovimentoMesa({ texto, confirmado, onChange, disabled }: {
  texto: string; confirmado: boolean; onChange: (v: boolean) => void; disabled: boolean;
}) {
  return <label className="flex items-start gap-2 text-sm">
    <Checkbox checked={confirmado} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} />
    <span>{texto}</span>
  </label>;
}

export function MoverPedidoMesa({ pedidoId, bloqueado }: { pedidoId: string; bloqueado: boolean }) {
  const q = useTransicoesMesaSp(pedidoId);
  const perm = usePermissaoAcao("acao.expedicao_sp_operar");
  const mover = useMoverMesaSp();
  const [menuAberto, setMenuAberto] = useState(false);
  const [destino, setDestino] = useState<TransicaoMesa | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const vazio = q.isSuccess && q.data.length === 0;
  const tooltip = q.error ? formatError(q.error) : vazio ? "Sem movimentos disponíveis nesta etapa" : !perm.permitido && !perm.carregando ? "Sem permissão para mover pedidos" : bloqueado ? "Cancelamento solicitado" : null;

  async function confirmar() {
    if (!destino || !destino.permitido || !perm.permitido || !podeConfirmarMovimento(destino.exige_motivo, motivo, pergunta, confirmado)) return;
    try {
      const r = await mover.mutateAsync({ p_pedido_id: pedidoId, p_para: destino.para, p_motivo: motivo.trim() || null, p_respostas: respostasMovimento(confirmado) });
      if (r.ok === false) { setPergunta(r.texto); setConfirmado(false); return; }
      setDestino(null);
    } catch { /* mensagem real exibida pela mutation */ }
  }

  return <>
    <Popover open={menuAberto} onOpenChange={(open) => { setMenuAberto(open); if (open) void q.refetch(); }}>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">
          <PopoverTrigger asChild><Button variant="outline" size="sm" disabled={q.isLoading || !!q.error || vazio || bloqueado || !perm.permitido || mover.isPending}>
            {q.isLoading ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}Mover para…
          </Button></PopoverTrigger>
        </span></TooltipTrigger>
        {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
      </Tooltip>
      <PopoverContent align="end" className="max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-1">
        {q.error ? <p className="p-2 text-sm text-destructive">{formatError(q.error)}</p> : (q.data ?? []).map((t, i) => <Tooltip key={`${t.para}-${i}`}>
          <TooltipTrigger asChild><div>
            <Button variant="ghost" disabled={!t.permitido} className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left" onClick={() => {
              setDestino(t); setMotivo(""); setPergunta(t.pergunta); setConfirmado(false); setMenuAberto(false);
            }}>
              <span>{t.rotulo}</span>
              <span className="text-xs font-normal text-muted-foreground">{t.descricao}</span>
              {!t.permitido && t.bloqueio && <span className="text-xs font-normal text-muted-foreground">{t.bloqueio}</span>}
            </Button>
          </div></TooltipTrigger>
          {!t.permitido && t.bloqueio && <TooltipContent>{t.bloqueio}</TooltipContent>}
        </Tooltip>)}
      </PopoverContent>
    </Popover>
    <Dialog open={!!destino} onOpenChange={(open) => { if (!open && !mover.isPending) setDestino(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mover para {destino?.rotulo}</DialogTitle><DialogDescription>{destino?.descricao}</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor="mesa-mover-motivo">Motivo{destino?.exige_motivo ? " (obrigatório)" : " (opcional)"}</Label>
          <Textarea id="mesa-mover-motivo" placeholder="Por que está movendo?" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={mover.isPending} />
        </div>
        {pergunta && <ConfirmacaoMovimentoMesa texto={pergunta} confirmado={confirmado} onChange={setConfirmado} disabled={mover.isPending} />}
        <DialogFooter>
          <Button variant="outline" disabled={mover.isPending} onClick={() => setDestino(null)}>Voltar</Button>
          <Button disabled={mover.isPending || !destino || !podeConfirmarMovimento(destino.exige_motivo, motivo, pergunta, confirmado)} onClick={() => void confirmar()}>
            {mover.isPending && <Loader2 className="animate-spin" />}Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}