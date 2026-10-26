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
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Send, MinusCircle } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useNivel } from "@/hooks/useNivel";

/**
 * Estação de PRÉ-FATURAMENTO.
 *
 * A tela NÃO valida nada: ela desenha o que a RPC
 * `fn_pedido_pre_faturamento_checklist` devolve, na ordem em que vem.
 * Regra nova vai pra RPC, nunca pro .tsx — foi uma regra morando em .tsx
 * (piso de 7 dias no antigo helper de vencimento, já removido) que produziu o PED-2164.
 *
 * Semáforo com override declarado, exceto portão:
 *  - bloqueia && !ok  → bloqueio duro (botão desabilitado, sem override)
 *  - !bloqueia && !ok → aviso; a RPC devolve exige_motivo e o envio pede motivo
 * `pode_enviar` e `exige_motivo` vêm prontos — não recalcular no cliente.
 * CONFERÊNCIA-É-A-PORTA (14/09/2026): `pode_enviar`/`exige_motivo` deixaram de ser
 * só regra de tela — a edge `enviar-pedido-bling` roda a MESMA conferência no envio
 * inicial e recusa (409) sem `motivo` de 15+ caracteres quando há avisos.
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

/** Itens físicos que não se aplicam quando a natureza não exige expedição. */
const ITENS_FISICOS = new Set(["frete", "transportadora", "volumes", "peso"]);

function IconeEstado({ item }: { item: ItemChecklist & { naoSeAplica?: boolean } }) {
  if (item.naoSeAplica) return <MinusCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />;
  if (item.ok) return <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />;
  if (item.bloqueia) return <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />;
}

export function PreFaturamentoCard({
  pedidoId, exigeExpedicao = true, blingIdDestino = null,
}: { pedidoId: string; exigeExpedicao?: boolean; blingIdDestino?: string | number | null }) {
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

  // O checklist do banco marca "bling" como não-ok quando já desceu; aqui já enviado é ✓.
  const itemBling = (data.itens ?? []).find((i) => i.codigo === "bling");
  const idDoDetalhe = itemBling?.detalhe?.match(/id\s+(\d+)/i)?.[1] ?? null;
  const idEnviado = blingIdDestino != null && String(blingIdDestino) !== "" ? String(blingIdDestino) : idDoDetalhe;
  const jaEnviado = idEnviado != null;
  const itens = (data.itens ?? []).map((i) =>
    jaEnviado && i.codigo === "bling"
      ? { ...i, ok: true, bloqueia: false, naoSeAplica: false, detalhe: `Enviado ao Bling (id ${idEnviado}) — emitir a NF lá` }
      : !exigeExpedicao && ITENS_FISICOS.has(i.codigo)
      ? { ...i, ok: true, naoSeAplica: true, detalhe: "Não se aplica — natureza sem movimento físico" }
      : { ...i, naoSeAplica: false },
  );
  const bloqueadores = itens.filter((i) => i.bloqueia && !i.ok);
  // Itens físicos "não se aplica" não contam como aviso.
  const exigeMotivo = exigeExpedicao
    ? data.exige_motivo
    : data.exige_motivo && itens.some((i) => !i.ok && !i.bloqueia);
  const podeEnviar = data.pode_enviar && !jaEnviado;
  const podeEscrever = temNivel(2);
  const motivoValido = motivo.trim().length >= MIN_MOTIVO;

  const disparar = async (comMotivo?: string) => {
    if (jaEnviado) return;
    try {
      await enviar.mutateAsync({ pedido_id: pedidoId, motivo: comMotivo });
      setDialogOpen(false);
      setMotivo("");
    } catch {
      // erro tratado no hook
    }
  };

  const onClickEnviar = () => {
    if (jaEnviado) return;
    if (exigeMotivo) {
      setDialogOpen(true);
      return;
    }
    void disparar();
  };

  const botao = (
    <Button
      size="sm"
      className="w-full gap-1.5"
      disabled={!podeEnviar || enviar.isPending}
      onClick={onClickEnviar}
    >
      {enviar.isPending
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Send className="h-4 w-4" />}
      {jaEnviado ? "Já enviado ao Bling" : "Enviar ao Bling"}
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
              <div className={item.naoSeAplica ? "text-muted-foreground" : item.ok ? "" : item.bloqueia ? "text-destructive" : "text-warning"}>
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
        !podeEnviar ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block w-full">{botao}</span>
              </TooltipTrigger>
              <TooltipContent>
                {jaEnviado
                  ? `Já enviado ao Bling (id ${blingIdDestino}) — emitir a NF lá`
                  : bloqueadores.length > 0
                  ? `Bloqueado por: ${bloqueadores.map((b) => b.rotulo).join(", ")}`
                  : "Envio bloqueado pela conferência."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : botao
      )}

      {podeEscrever && (
        <p className="text-xs text-muted-foreground leading-snug">
          {exigeExpedicao
            ? "A NF é emitida no Bling. O pedido vira Faturado sozinho quando ela for ingerida."
            : "A NF é emitida no Bling (modalidade de frete: sem frete). O pedido vira Entregue sozinho quando ela for ingerida."}
        </p>
      )}

      <Dialog
        open={dialogOpen && !jaEnviado}
        onOpenChange={(v) => {
          if (enviar.isPending) return;
          setDialogOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar com pendências</DialogTitle>
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
              disabled={!motivoValido || enviar.isPending || jaEnviado}
              onClick={() => void disparar(motivo.trim())}
              className="gap-1.5"
            >
              {enviar.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              Enviar ao Bling
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
