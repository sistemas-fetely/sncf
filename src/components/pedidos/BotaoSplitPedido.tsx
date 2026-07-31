import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SplitPedidoDialog } from "@/components/pedidos/dialogs/SplitPedidoDialog";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  pedido_id: string;
  id_externo: string;
  valor_liquido: number;
  valor_bruto?: number;
  estagio: string | null | undefined;
  /** "full" = botão largura total | "compact" = botão de tabela | "menuitem" = item de DropdownMenu */
  variante?: "full" | "compact" | "menuitem";
}


/**
 * Gatilho único do split. Nenhuma lista de estágio em código:
 * a liberação vem da dimensão `pedido_edicao_campo` (campo = 'split').
 */
export function BotaoSplitPedido({
  pedido_id,
  id_externo,
  valor_liquido,
  valor_bruto,
  estagio,
  variante = "full",
  open: openProp,
  onOpenChange,
}: Props) {
  const [openInterno, setOpenInterno] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? !!openProp : openInterno;
  const setOpen = (v: boolean) => {
    if (controlado) onOpenChange?.(v);
    else setOpenInterno(v);
  };
  const { regraDe, isLoading } = usePedidoEdicaoCampo(estagio);
  const { data: permissoes } = usePermissoesDoUsuario();
  const { roles } = useAuth();

  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const podeSplit = isSuperAdmin || (permissoes?.has("operacao.split_pedido") ?? false);
  const permitido = regraDe("split")?.permitido ?? false;

  if (isLoading || !podeSplit || !permitido) return null;

  const rotulo = regraDe("split")?.rotulo || "Split";

  // Só o diálogo — usado quando o gatilho vive dentro de um DropdownMenu
  // (o conteúdo do menu desmonta ao fechar e levaria o diálogo junto).
  if (variante === "dialogo") {
    return (
      <SplitPedidoDialog
        open={open}
        onOpenChange={setOpen}
        pedido_id={pedido_id}
        id_externo={id_externo}
        valor_liquido={valor_liquido}
        valor_bruto={valor_bruto ?? valor_liquido}
        estagio_origem={estagio ?? null}
      />
    );
  }

  if (variante === "menuitem") {
    return (
      <DropdownMenuItem onSelect={() => setOpen(true)}>
        <Scissors className="h-4 w-4 mr-2" />
        {rotulo}
      </DropdownMenuItem>
    );
  }

  return (
    <>
      {variante === "compact" ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} title={rotulo}>
          <Scissors className="h-3 w-3 mr-1" />
          {rotulo}
        </Button>
      ) : (
        <Button variant="outline" className="w-full gap-2" onClick={() => setOpen(true)}>
          <Scissors className="h-4 w-4" />
          {rotulo}
        </Button>
      )}

      <SplitPedidoDialog
        open={open}
        onOpenChange={setOpen}
        pedido_id={pedido_id}
        id_externo={id_externo}
        valor_liquido={valor_liquido}
        valor_bruto={valor_bruto ?? valor_liquido}
        estagio_origem={estagio ?? null}
      />
    </>
  );
}

