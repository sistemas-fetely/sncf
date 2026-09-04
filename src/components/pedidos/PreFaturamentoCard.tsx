import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Send } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useNivel } from "@/hooks/useNivel";

/**
 * Estação de PRÉ-FATURAMENTO.
 *
 * A tela NÃO valida nada: ela desenha o que a RPC
 * `fn_pedido_pre_faturamento_checklist` devolve, na ordem em que vem.
 * Regra nova vai pra RPC, nunca pro .tsx — foi uma regra morando em .tsx
 * (piso de 7 dias em sugerir-vencimento-boleto.ts) que produziu o PED-2164.
 *
 * Semáforo com override declarado, exceto portão:
 *  - bloqueia && !ok  → bloqueio duro (botão desabilitado, sem override)
 *  - !bloqueia && !ok → aviso; a RPC devolve exige_motivo e o envio pede motivo
 * `pode_enviar` e `exige_motivo` vêm prontos — não recalcular no cliente.
 */

export const PRE_FATURAMENTO_CHECKLIST_KEY = (pedidoId: string) =>
  ["pre-faturamento-checklist", pedidoId] as const;

const MIN_MOTIVO = 15; // mesmo padrão do `forcar` em empurrar-pedido-xpm

interface ItemChecklist {
  codigo: string;
  rotulo: string;
  ok: boolean;
  bloqueia: boolean;
  detalhe: string | null;
}

interface Checklist {
  pedido_id: string;
  id_externo: string;
  estagio: string;
  pode_enviar: boolean;
  exige_motivo: boolean;
  bloqueios: number;
  avisos: number;
  itens: ItemChecklist[];
}

function IconeEstado({ item }: { item: ItemChecklist }) {
  if (item.ok) return <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />;
  if (item.bloqueia) return <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />;
}

export function PreFaturamentoCard({ pedidoId }: { pedidoId: string }) {
  const { temNivel } = useNivel();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const enviar = useEnviarBling();

  const { data, isLoading, error } = useQuery({
    queryKey: PRE_FATURAMENTO_CHECKLIST_KEY(pedidoId),
    queryFn: async (): Promise<Checklist> => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fn_pedido_pre_faturamento_checklist" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { p_pedido_id: pedidoId } as any,
      );
      if (error) throw error;
      return data as unknown as Checklist;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Conferindo o pedido...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive flex gap-2">
        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Não foi possível carregar a conferência de pré-faturamento.</span>
      </div>
    );
  }

  const itens = data.itens ?? [];
  const bloqueadores = itens.filter((i) => i.bloqueia && !i.ok);
  const podeEscrever = temNivel(2);
  const motivoValido = motivo.trim().length >= MIN_MOTIVO;

  const disparar = async (comMotivo?: string) => {
    try {
      await enviar.mutateAsync({ pedido_id: pedidoId, motivo: comMotivo });
      setDialogOpen(false);
      setMotivo("");
    } catch {
      // erro tratado no hook
    }
  };

  const onClickEnviar = () => {
    if (data.exige_motivo) {
      setDialogOpen(true);
      return;
    }
    void disparar();
  };

  const botao = (
    <Button
      size="sm"
      className="w-full gap-1.5"
      disabled={!data.pode_enviar || enviar.isPending}
      onClick={onClickEnviar}
    >
      {enviar.isPending
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Send className="h-4 w-4" />}
      Enviar ao Bling e faturar
    </Button>
  );

  return (
    <div className="w-full rounded-md border p-3 space-y-3">
      <div className="text-sm font-medium">Conferência de pré-faturamento</div>

      <ul className="space-y-2">
        {itens.map((item) => (
          <li key={item.codigo} className="flex gap-2 text-sm">
            <IconeEstado item={item} />
            <div className="min-w-0">
              <div className={item.ok ? "" : item.bloqueia ? "text-destructive" : "text-warning"}>
                {item.rotulo}
              </div>
              {item.detalhe && (
                <div className="text-xs text-muted-foreground break-words">{item.detalhe}</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {podeEscrever && (
        !data.pode_enviar ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block w-full">{botao}</span>
              </TooltipTrigger>
              <TooltipContent>
                {bloqueadores.length > 0
                  ? `Bloqueado por: ${bloqueadores.map((b) => b.rotulo).join(", ")}`
                  : "Envio bloqueado pela conferência."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : botao
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (enviar.isPending) return;
          setDialogOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Faturar com pendências</DialogTitle>
            <DialogDescription>
              Pedido <strong>#{data.id_externo}</strong> tem {data.avisos} aviso(s) na conferência.
              Descreva o motivo do envio mesmo assim (mínimo {MIN_MOTIVO} caracteres).
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: peso e volume confirmados por telefone com a expedição"
            rows={3}
          />
          <div className="text-xs text-muted-foreground">
            {motivo.trim().length}/{MIN_MOTIVO} caracteres
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={enviar.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!motivoValido || enviar.isPending}
              onClick={() => void disparar(motivo.trim())}
              className="gap-1.5"
            >
              {enviar.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              Enviar ao Bling e faturar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
