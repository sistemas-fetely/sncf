/**
 * BONIFICAÇÕES — o que o cliente já recebeu sem pagar.
 *
 * Aba da ficha do cliente. Fonte: vw_conta_cliente_cortesias (pedidos bonificados e
 * créditos de cortesia). Total somado no topo: bonificação também é dinheiro.
 */
import { AlertTriangle, Gift } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { useCortesiasCliente } from "@/hooks/financeiro/useContaCliente";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function BonificacoesTab({ parceiroId }: { parceiroId: string }) {
  const { data: linhas, isLoading, isError, error } = useCortesiasCliente(parceiroId);

  const lista = linhas ?? [];
  const total = lista.reduce((s, l) => s + Number(l.valor ?? 0), 0);
  const pedidos = lista.filter((l) => l.tipo === "pedido");
  const creditos = lista.filter((l) => l.tipo === "credito");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tudo que saiu para este cliente sem cobrança: pedidos bonificados e créditos de
        cortesia. Serve para saber quanto já foi dado antes de dar mais.
      </p>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as bonificações</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? "Erro desconhecido."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Total bonificado</p>
          <p className="text-sm font-medium">{isError ? "—" : formatBRL(total)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Pedidos bonificados</p>
          <p className="text-sm font-medium">
            {isError ? "—" : `${pedidos.length} · ${formatBRL(
              pedidos.reduce((s, l) => s + Number(l.valor ?? 0), 0),
            )}`}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Créditos de cortesia</p>
          <p className="text-sm font-medium">
            {isError ? "—" : `${creditos.length} · ${formatBRL(
              creditos.reduce((s, l) => s + Number(l.valor ?? 0), 0),
            )}`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : isError ? null : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border/60 py-10 text-sm text-muted-foreground">
          <Gift className="h-5 w-5" />
          Este cliente não recebeu bonificação.
        </div>
      ) : (
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Data</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead className="w-28">Referência</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead className="w-40">Natureza</TableHead>
                <TableHead className="w-28 text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={`${l.tipo}-${l.origem_id}`}>
                  <TableCell className="align-top text-sm">{dataBR(l.data)}</TableCell>
                  <TableCell className="align-top">
                    <Selo estado={l.tipo === "pedido" ? "info" : "muted"}>
                      {l.tipo === "pedido" ? "Pedido" : "Crédito"}
                    </Selo>
                  </TableCell>
                  <TableCell className="align-top text-sm">{l.referencia ?? "—"}</TableCell>
                  <TableCell className="align-top text-sm">
                    {l.qtd_itens > 0 && l.itens ? (
                      <>
                        <span className="leading-snug">{l.itens}</span>
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({l.qtd_itens} item{l.qtd_itens > 1 ? "s" : ""})
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {l.natureza ?? "—"}
                    {l.situacao ? ` · ${l.situacao}` : ""}
                  </TableCell>
                  <TableCell className="align-top text-right text-sm font-medium">
                    {formatBRL(Number(l.valor ?? 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
