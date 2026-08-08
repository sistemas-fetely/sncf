import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PainelEditarPedido } from "@/components/pedidos/PainelEditarPedido";
import { ESTAGIO_LABELS } from "@/types/pedido";

// Depois do pré-faturamento o pedido já está comprometido com Bling/NF —
// editar aqui produziria divergência entre SNCF e documento fiscal.
export const ESTAGIOS_EDICAO_BLOQUEADA = [
  "pre_faturamento",
  "faturado",
  "em_transporte",
  "entregue",
  "cancelado",
] as const;

export function edicaoBloqueadaPorEstagio(estagio: string | null | undefined): boolean {
  return (ESTAGIOS_EDICAO_BLOQUEADA as readonly string[]).includes(String(estagio ?? ""));
}

export const rotuloEstagioHumano = (e: string | null | undefined) =>
  (ESTAGIO_LABELS as Record<string, string>)[String(e ?? "")] ?? String(e ?? "").replace(/_/g, " ");

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itens: any[];
}

/**
 * Ação "Editar pedido" da coluna AÇÕES. Variante outline de propósito:
 * o único botão preenchido/destrutivo da coluna é "Cancelar pedido".
 * A trava por estágio é espelho da guarda de banco (fn_exigir_edicao_permitida
 * sobre a dimensão pedido_edicao_campo).
 */
export function BotaoEditarPedido({ pedido, itens }: Props) {
  const [open, setOpen] = useState(false);
  const estagio = String(pedido?.estagio ?? "");
  const bloqueado = edicaoBloqueadaPorEstagio(estagio);

  const botao = (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      disabled={bloqueado}
      onClick={() => setOpen(true)}
    >
      <Pencil className="h-4 w-4" />
      Editar pedido
    </Button>
  );

  return (
    <>
      {bloqueado ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-full">{botao}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Pedido em {rotuloEstagioHumano(estagio)} — edição travada a partir desse estágio.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        botao
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar pedido{pedido?.id_externo ? ` ${pedido.id_externo}` : ""}</DialogTitle>
            <DialogDescription>
              As regras de o-que-pode-ser-editado moram na dimensão de edição do pedido.
            </DialogDescription>
          </DialogHeader>
          <PainelEditarPedido pedidoId={pedido.id} pedido={pedido} itens={itens} />
        </DialogContent>
      </Dialog>
    </>
  );
}
