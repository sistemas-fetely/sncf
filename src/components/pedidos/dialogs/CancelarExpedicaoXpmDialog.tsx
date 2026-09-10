import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

const MIN_MOTIVO = 15;

interface Props {
  pedidoId: string;
  expedicaoCodigo: string;
}

/**
 * Caminho PRIMARIO: cancela de verdade na ZenLOG (POST CancelaExpedicao), liberado
 * na doutrina em 09/09/2026. A edge faz XPM primeiro, SNCF depois — e grita quando
 * cancelou na XPM sem atualizar o SNCF. Aqui a tela so exibe o erro inteiro.
 */
export function CancelarExpedicaoXpmDialog({ pedidoId, expedicaoCodigo }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const valido = motivo.trim().length >= MIN_MOTIVO;

  async function cancelar() {
    setEnviando(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("cancelar-expedicao-xpm", {
        body: { expedicao_codigo: expedicaoCodigo, motivo: motivo.trim() },
      });

      // FAIL-LOUD: o corpo da resposta importa mais que o status. Nada de truncar.
      let corpo: unknown = data;
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          corpo = await ctx.json().catch(() => null);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = (corpo ?? {}) as any;

      if (resp?.sucesso !== true) {
        const partes = [
          resp?.erro ?? error?.message ?? "Falha desconhecida ao cancelar na XPM",
          resp?.resposta_xpm ? `Resposta da XPM: ${JSON.stringify(resp.resposta_xpm)}` : null,
        ].filter(Boolean);
        setErro(partes.join("\n\n"));
        return;
      }

      invalidarPedido(qc, pedidoId);
      toast({
        title: "Expedição cancelada na XPM",
        description: `${expedicaoCodigo} cancelada. O pedido voltou para Pré-Separação no SNCF.`,
      });
      setOpen(false);
      setMotivo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) { setMotivo(""); setErro(null); } }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="destructive"
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2"
        >
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Cancelar expedição na XPM
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar expedição na XPM</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              Isto cancela <strong>de verdade</strong> a expedição{" "}
              <span className="tabular-nums">{expedicaoCodigo}</span> na XPM, pela API
              da ZenLOG. Não é declaração: a carga deixa de existir no armazém.
            </span>
            <span className="block">
              Se a XPM confirmar, o pedido volta para <strong>Pré-Separação</strong> no
              SNCF, onde pode ser editado e empurrado de novo.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo-cancelar-xpm" className="text-xs">
            Motivo (fica registrado no histórico do pedido)
          </Label>
          <Textarea
            id="motivo-cancelar-xpm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: cliente removeu item na loja, carga precisa ser refeita"
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {motivo.trim().length}/{MIN_MOTIVO} caracteres mínimos
          </p>
        </div>

        {erro && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">Cancelamento não concluído</p>
            <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
              {erro}
            </pre>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!valido || enviando}
            onClick={cancelar}
          >
            {enviando ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Cancelando na XPM…</>
            ) : (
              "Cancelar na XPM"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
