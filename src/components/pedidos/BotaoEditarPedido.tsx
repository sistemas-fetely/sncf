import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PainelEditarPedido } from "@/components/pedidos/PainelEditarPedido";
import { ESTAGIO_LABELS } from "@/types/pedido";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";

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
 * A trava NÃO mora no código: é derivada da dimensão public.pedido_edicao_campo
 * (mesma fonte da guarda de banco fn_exigir_edicao_permitida).
 */
export function BotaoEditarPedido({ pedido, itens }: Props) {
  const [open, setOpen] = useState(false);
  const estagio = String(pedido?.estagio ?? "");
  const dim = usePedidoEdicaoCampo(estagio);

  const carregando = dim.isLoading || dim.isPending;
  const bloqueado = !carregando && !dim.painelEditavel(estagio);

  const botao = (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      disabled={carregando || bloqueado}
      onClick={() => setOpen(true)}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
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
              {dim.observacaoBloqueio(estagio) ??
                `Pedido em ${rotuloEstagioHumano(estagio)} — nenhum campo é editável neste estágio.`}
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
