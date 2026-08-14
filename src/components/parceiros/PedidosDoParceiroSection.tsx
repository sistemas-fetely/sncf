import { useNavigate } from "react-router-dom";
import { Package, FileText, Code } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePedidosFila } from "@/hooks/pedidos/usePedidosFila";
import { useNfsDosPedidosParceiro } from "@/hooks/parceiros/useNfsDosPedidosParceiro";
import { cn } from "@/lib/utils";
import { classeSituacao, rotuloSituacao } from "@/lib/pedidos/situacao-financeira";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { formatError } from "@/lib/format-error";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarData(dataPedido?: string | null, recebidoEm?: string | null) {
  const bruto = dataPedido || recebidoEm;
  if (!bruto) return "—";
  const d = new Date(bruto.length === 10 ? `${bruto}T00:00:00` : bruto);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function PedidosDoParceiroSection({ parceiroId }: { parceiroId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = usePedidosFila({
    parceiroId,
    apenasAtivos: false,
  });

  const pedidos = data || [];

  const entregues = pedidos.filter((p) => p.estagio === "entregue").length;
  const cancelados = pedidos.filter((p) => p.estagio === "cancelado").length;
  const recuperacao = pedidos.filter((p) => p.estagio === "recuperacao_venda").length;
  const andamento = pedidos.length - entregues - cancelados - recuperacao;

  const partes: string[] = [];
  if (andamento > 0) partes.push(`${andamento} em andamento`);
  if (entregues > 0) partes.push(`${entregues} ${entregues === 1 ? "entregue" : "entregues"}`);
  if (cancelados > 0) partes.push(`${cancelados} ${cancelados === 1 ? "cancelado" : "cancelados"}`);
  if (recuperacao > 0) partes.push(`${recuperacao} em recuperação`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Pedidos
          </span>
          <Badge variant="secondary">{pedidos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {formatError(error)}
          </div>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido registrado para este cliente.</p>
        ) : (
          <div className="space-y-2">
            {partes.length > 0 && (
              <p className="text-xs text-muted-foreground">{partes.join(" · ")}</p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Externo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/pedidos/${p.id}`)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs">{p.id_externo}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatarData(p.data_pedido, p.recebido_em)}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {fmtBRL.format(Number(p.valor_liquido || 0))}
                    </TableCell>
                    <TableCell>
                      <EstagioBadge estagio={p.estagio} />
                    </TableCell>
                    <TableCell>
                      {p.situacao_financeira || p.situacao_rotulo ? (
                        <Badge
                          className={cn(
                            classeSituacao(p.situacao_financeira),
                            "text-[10px] py-0 px-1.5 whitespace-normal text-left",
                          )}
                        >
                          {rotuloSituacao(
                            p.situacao_financeira,
                            p.situacao_rotulo,
                            p.lastro_porque,
                          )}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
