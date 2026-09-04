import type { ItemPreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";

interface Props {
  itens: ItemPreviaEstoqueXpm[];
  fotoEm: string | null;
}

function fmtFoto(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).replace(", ", " ");
}

/**
 * FONTE-ÚNICA do texto de falta de estoque na XPM: usado no detalhe do pedido
 * (ForcarXpmEstoqueDialog) e na fila (EmpurrarXpmLinhaDialog).
 * Só apresentação — sem estado, sem mutação.
 */
export function BlocoFaltaEstoqueXpm({ itens, fotoEm }: Props) {
  const foto = fmtFoto(fotoEm ?? itens[0]?.foto_em ?? null);

  return (
    <div className="space-y-3">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="font-normal py-1">SKU</th>
            <th className="font-normal py-1">Item</th>
            <th className="font-normal py-1 text-right">Pede</th>
            <th className="font-normal py-1 text-right">Tem</th>
            <th className="font-normal py-1 text-right">Falta</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.sku} className="border-t border-border">
              <td className="py-1">{it.sku}</td>
              <td className="py-1">{it.nome}</td>
              <td className="py-1 text-right">{it.pedida}</td>
              <td className="py-1 text-right">{it.disponivel}</td>
              <td className="py-1 text-right text-destructive">{it.falta}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {foto && (
        <p className="text-xs text-muted-foreground">Posição da XPM de {foto}</p>
      )}

      {itens.filter((it) => !!it.compra_pedidos).map((it) => (
        <p key={`compra-${it.sku}`} className="text-xs text-muted-foreground tabular-nums">
          Compra aberta {it.compra_pedidos}: {it.compra_a_faturar ?? 0} un a faturar,{" "}
          {it.compra_em_transito ?? 0} un em trânsito — saldo de compra, não
          previsão de entrega.
        </p>
      ))}

      <p className="text-xs text-muted-foreground">
        Se o saldo realmente faltar, a XPM corta o item e pode cancelar o
        documento — e o cancelamento não volta pelo espelho, então o pedido
        fica parado no SNCF sem aviso.
      </p>
    </div>
  );
}
