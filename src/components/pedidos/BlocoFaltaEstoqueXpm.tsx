import { Link } from "react-router-dom";
import { Selo } from "@/components/ui/selo";
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

function fmtData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const ROTULO_FALLBACK: Record<string, string> = {
  falta_real: "Falta nas duas leituras",
  foto_nao_cobre: "Foto do armazém atrasada",
  fila_disputada: "Peça prometida a outro pedido",
  ambos_cobrem: "Coberto",
};

function consequencia(veredito: string | null | undefined): string {
  if (veredito === "fila_disputada") {
    return "A peça existe e está liberada, mas está prometida a outro pedido — quem for cortado é o outro.";
  }
  if (veredito === "foto_nao_cobre") {
    return "A foto do armazém está atrás do nosso registro; se a peça ainda não estiver liberada na doca, a XPM corta.";
  }
  return "A XPM corta o item e pode cancelar o documento; o cancelamento não volta pelo espelho, então o pedido fica parado sem aviso.";
}

/**
 * VEREDITO-CRUZADO: duas leituras lado a lado, dizendo qual delas barra.
 * FONTE-ÚNICA do texto de estoque na XPM: usado no detalhe do pedido
 * (ForcarXpmEstoqueDialog) e na fila (EmpurrarXpmLinhaDialog).
 * Só apresentação — sem estado, sem mutação.
 */
export function BlocoFaltaEstoqueXpm({ itens, fotoEm }: Props) {
  const foto = fmtFoto(fotoEm ?? itens[0]?.foto_em ?? null);

  return (
    <div className="space-y-3">
      {itens.map((it) => {
        const vered = it.veredito_item ?? null;
        const rotulo = it.veredito_item_rotulo || ROTULO_FALLBACK[vered ?? ""] || "Estoque insuficiente";
        const fotoItem = fmtFoto(it.foto_em) ?? foto;
        const concorrentes = vered === "fila_disputada"
          ? [...(it.concorrentes ?? [])].sort((a, b) =>
              String(a.recebido_em ?? "").localeCompare(String(b.recebido_em ?? "")))
          : [];

        return (
          <div key={it.sku} className="rounded-md border border-border p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium tabular-nums">{it.sku}</p>
                <p className="text-xs text-muted-foreground truncate">{it.nome}</p>
              </div>
              <Selo estado={vered === "falta_real" ? "destructive" : "warning"}>{rotulo}</Selo>
            </div>

            <p className="text-xs text-muted-foreground tabular-nums">
              Pedido: {it.pedida} un
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nossa fila</p>
                <p className="text-xs tabular-nums">
                  {it.nosso_disponivel ?? 0} un livres de {it.fiscal_vendavel ?? 0} sadias
                </p>
                {(it.reservado_outros ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {it.reservado_outros} un reservadas para outros pedidos
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Armazém XPM</p>
                <p className="text-xs tabular-nums">
                  {it.xpm_liberado ?? it.disponivel ?? 0} un liberadas
                </p>
                {(it.xpm_outras_situacoes ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {it.xpm_outras_situacoes} un em outras situações — tipicamente
                    recém-recebido e ainda não liberado
                  </p>
                )}
                {fotoItem && (
                  <p className="text-xs text-muted-foreground">foto de {fotoItem}</p>
                )}
              </div>
            </div>

            {concorrentes.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-muted-foreground">
                  Liberar este pedido tira a peça destes — e eles vão receber
                  anotação no histórico:
                </p>
                <ul className="space-y-0.5">
                  {concorrentes.map((c) => (
                    <li key={c.pedido_id} className="text-xs tabular-nums">
                      <Link
                        to={`/pedidos/${c.pedido_id}`}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {c.id_externo ?? c.pedido_id}
                      </Link>
                      <span className="text-muted-foreground">
                        {c.estagio ? ` · ${c.estagio}` : ""}
                        {c.qtd != null ? ` · ${c.qtd} un` : ""}
                        {fmtData(c.recebido_em) ? ` · recebido ${fmtData(c.recebido_em)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {it.compra_pedidos && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Compra aberta {it.compra_pedidos}: {it.compra_a_faturar ?? 0} un a
                faturar, {it.compra_em_transito ?? 0} un em trânsito — saldo de
                compra, não previsão de entrega.
              </p>
            )}

            <p className="text-xs text-muted-foreground">{consequencia(vered)}</p>
          </div>
        );
      })}
    </div>
  );
}
