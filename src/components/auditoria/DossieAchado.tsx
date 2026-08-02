/**
 * Bloco de contexto expansível de um achado da Auditoria Financeira.
 *
 * Busca SOB DEMANDA (só com `aberto = true`): `vw_pedido_hipotese` e
 * `vw_dossie_pedido` são views caras — varredura completa dá timeout.
 * Somente leitura: nenhuma ação de resolver/conciliar/vincular aqui.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { formatError } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { AlertTriangle } from "lucide-react";
import { useDossiePedido, usePedidoHipotese } from "@/hooks/useDossiePedido";
import { HipoteseLista } from "./HipotesePedido";
import {
  BlocoCaixa, BlocoFamilia, BlocoFiscal, BlocoItens, BlocoTerminais, BlocoTitulos, Secao,
} from "./DossieBlocos";

function Erro({ err }: { err: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex gap-2">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>{formatError(err)}</span>
    </div>
  );
}

export default function DossieAchado({
  pedidoId,
  aberto,
}: {
  pedidoId: string;
  aberto: boolean;
}) {
  const hip = usePedidoHipotese(pedidoId, aberto);
  const dos = useDossiePedido(pedidoId, aberto);

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-5">
      {/* Hipótese */}
      <Secao titulo="Hipótese do sistema">
        {hip.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : hip.isError ? (
          <Erro err={hip.error} />
        ) : (
          <HipoteseLista hipoteses={hip.data ?? []} />
        )}
      </Secao>

      {/* Dossiê */}
      {dos.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : dos.isError ? (
        <Erro err={dos.error} />
      ) : !dos.data ? (
        <div className="text-xs text-muted-foreground">
          Sem dossiê disponível para este pedido.
        </div>
      ) : (
        <div className="space-y-5">
          <Secao titulo="Pedido">
            <div className="rounded-md border bg-background px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">
                Data: <span className="text-foreground">{formatDateBR(dos.data.data_pedido)}</span>
              </span>
              <span className="text-muted-foreground">
                Valor:{" "}
                <span className="text-foreground tabular-nums">
                  {formatBRL(Number(dos.data.valor_pedido || 0))}
                </span>
              </span>
              <span className="text-muted-foreground">
                Faturado:{" "}
                <span className="text-foreground">
                  {dos.data.faturado_em ? formatDateBR(String(dos.data.faturado_em).slice(0, 10)) : "—"}
                </span>
              </span>
              <span className="text-muted-foreground">
                Entregue:{" "}
                <span className="text-foreground">
                  {dos.data.entregue_em ? formatDateBR(String(dos.data.entregue_em).slice(0, 10)) : "—"}
                </span>
              </span>
              <span className="text-muted-foreground">
                NFs: <span className="text-foreground tabular-nums">{dos.data.nfs ?? 0}</span>
                {dos.data.nf_refs ? ` (${dos.data.nf_refs})` : ""}
              </span>
              <span className="text-muted-foreground">
                Furos: <span className="text-foreground tabular-nums">{dos.data.furos_qtd ?? 0}</span>
              </span>
            </div>
          </Secao>

          <BlocoFamilia familia={dos.data.familia} />
          <BlocoItens itens={dos.data.itens} />
          <BlocoFiscal fiscal={dos.data.fiscal} />
          <BlocoTitulos titulos={dos.data.titulos} />
          <BlocoCaixa caixa={dos.data.caixa} />
          <BlocoTerminais terminais={dos.data.terminais} />
        </div>
      )}
    </div>
  );
}
