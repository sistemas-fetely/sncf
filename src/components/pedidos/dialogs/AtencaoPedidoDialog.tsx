import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PauseCircle, Bell } from 'lucide-react';
import { useMarcarAtencao } from '@/hooks/pedidos/useAtencaoPedido';

interface Props {
  pedidoId: string;
  children: React.ReactNode;
}

export function AtencaoPedidoDialog({ pedidoId, children }: Props) {
  const [open, setOpen] = useState(false);
  const [nivel, setNivel] = useState<'pausa' | 'aviso'>('pausa');
  const [motivo, setMotivo] = useState('');
  const marcar = useMarcarAtencao();

  const motivoValido = motivo.trim().length >= 5;

  const handleConfirm = async () => {
    if (!motivoValido) return;
    await marcar.mutateAsync({ pedidoId, nivel, motivo: motivo.trim() });
    setOpen(false);
    setMotivo('');
    setNivel('pausa');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar atenção no pedido</DialogTitle>
          <DialogDescription>
            <strong>Pausa</strong> bloqueia qualquer avanço automático ou manual até ser removida.{' '}
            <strong>Aviso</strong> sinaliza sem bloquear.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de atenção</Label>
            <RadioGroup
              value={nivel}
              onValueChange={(v) => setNivel(v as 'pausa' | 'aviso')}
              className="flex flex-col gap-2"
            >
              <label
                htmlFor="atencao-pausa"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <RadioGroupItem value="pausa" id="atencao-pausa" className="mt-1" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <PauseCircle className="h-4 w-4 text-red-600" />
                    Pausa
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bloqueia todo avanço do pedido até remoção manual.
                  </p>
                </div>
              </label>
              <label
                htmlFor="atencao-aviso"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <RadioGroupItem value="aviso" id="atencao-aviso" className="mt-1" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Bell className="h-4 w-4 text-amber-500" />
                    Aviso
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sinaliza no cabeçalho sem bloquear o fluxo.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="atencao-motivo">Motivo *</Label>
            <Textarea
              id="atencao-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Cliente pediu revisão do item 3 — trocar cor"
              rows={3}
            />
            {motivo.length > 0 && !motivoValido && (
              <p className="text-xs text-destructive">Mínimo 5 caracteres.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!motivoValido || marcar.isPending}
            variant={nivel === 'pausa' ? 'destructive' : 'default'}
          >
            {marcar.isPending
              ? 'Salvando...'
              : nivel === 'pausa'
              ? 'Pausar pedido'
              : 'Marcar aviso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
