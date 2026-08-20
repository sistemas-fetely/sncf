import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SplitPedidoDialog } from "@/components/pedidos/dialogs/SplitPedidoDialog";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  pedido_id: string;
  id_externo: string;
  valor_liquido: number;
  valor_bruto?: number;
  estagio: string | null | undefined;
  /** "full" | "compact" | "menuitem" (só o item de menu) | "dialogo" (só o diálogo) */
  variante?: "full" | "compact" | "menuitem" | "dialogo";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  const { permitido: permissaoSplit, carregando: carregandoPermissao } =
    usePermissaoAcao("acao.split_pedido");
  const { roles } = useAuth();

  const isSuperAdmin = (roles ?? []).includes("super_admin");
  // ACAO-NAO-MORA-NA-LISTA-DE-TELAS (19/08/2026): usuario_telas_permitidas filtra
  // tipo='tela'. Permissao de acao so e legivel por usuario_tem_acao/usePermissaoAcao.
  const podeSplit = isSuperAdmin || permissaoSplit;
  const permitido = regraDe("split")?.permitido ?? false;

  if (isLoading || carregandoPermissao || !podeSplit || !permitido) return null;

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

