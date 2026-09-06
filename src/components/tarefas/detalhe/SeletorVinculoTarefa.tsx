import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorPedidoVinculo } from "./SeletorPedidoVinculo";
import { SeletorTituloVinculo } from "./SeletorTituloVinculo";
import { pedidoIdDaUrl } from "@/hooks/tarefas/usePedidosParaVinculo";
import { tituloIdDaUrl, urlTitulo } from "@/hooks/tarefas/useTitulosParaVinculo";

/** Os três campos do vínculo andam sempre juntos. */
export interface VinculoTarefa {
  entidade_origem_id: string | null;
  modulo_origem: string | null;
  acao_url: string | null;
}

const VAZIO: VinculoTarefa = { entidade_origem_id: null, modulo_origem: null, acao_url: null };

type Tipo = "nenhum" | "pedidos" | "cobranca";

interface Props {
  moduloOrigem: string | null;
  entidadeId: string | null;
  acaoUrl: string | null;
  onChange: (v: VinculoTarefa) => void;
  disabled?: boolean;
}

/**
 * Um campo só, dois passos: primeiro o tipo da entidade, depois a busca do item.
 * Trocar de tipo limpa a escolha anterior — a tarefa se liga a uma entidade por vez.
 */
export function SeletorVinculoTarefa({
  moduloOrigem, entidadeId, acaoUrl, onChange, disabled,
}: Props) {
  const pedidoId = moduloOrigem === "pedidos" ? entidadeId : pedidoIdDaUrl(acaoUrl);
  const tituloId = moduloOrigem === "cobranca" ? entidadeId : tituloIdDaUrl(acaoUrl);

  const tipo: Tipo =
    moduloOrigem === "cobranca" || (!pedidoId && !!tituloId)
      ? "cobranca"
      : pedidoId
        ? "pedidos"
        : "nenhum";

  return (
    <div className="space-y-1.5">
      <Select
        value={tipo}
        disabled={disabled}
        onValueChange={(v) => {
          // trocar de tipo limpa a escolha anterior
          if (v !== tipo) onChange(VAZIO);
        }}
      >
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhum">Nenhum</SelectItem>
          <SelectItem value="pedidos">Pedido</SelectItem>
          <SelectItem value="cobranca">Título a receber</SelectItem>
        </SelectContent>
      </Select>

      {tipo === "pedidos" && (
        <SeletorPedidoVinculo
          pedidoId={pedidoId}
          disabled={disabled}
          onChange={(p) =>
            onChange(
              p
                ? { entidade_origem_id: p.id, modulo_origem: "pedidos", acao_url: `/pedidos/${p.id}` }
                : VAZIO,
            )
          }
        />
      )}

      {tipo === "cobranca" && (
        <SeletorTituloVinculo
          tituloId={tituloId}
          disabled={disabled}
          onChange={(t) =>
            onChange(
              t
                ? { entidade_origem_id: t.id, modulo_origem: "cobranca", acao_url: urlTitulo(t.id) }
                : VAZIO,
            )
          }
        />
      )}
    </div>
  );
}
