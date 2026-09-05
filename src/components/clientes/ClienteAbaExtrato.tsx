/**
 * Extrato da conta do cliente. Data desc, sinal +/− colorido.
 * A única escrita é registrar recebimento — cliente já pré-selecionado.
 */
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useContaClienteLancamentos } from "@/hooks/financeiro/useContaCliente";
import { RegistrarRecebimentoDialog } from "@/components/financeiro/RegistrarRecebimentoDialog";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function ClienteAbaExtrato({
  parceiroId,
  clienteNome,
}: {
  parceiroId: string;
  clienteNome: string | null;
}) {
  const lancamentos = useContaClienteLancamentos(parceiroId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Todo dinheiro entra na conta do CNPJ; o pedido debita o saldo.
        </p>
        <RegistrarRecebimentoDialog parceiroId={parceiroId} parceiroNome={clienteNome}>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Registrar recebimento
          </Button>
        </RegistrarRecebimentoDialog>
      </div>

      {lancamentos.isLoading && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> carregando
        </p>
      )}

      {lancamentos.isError && (
        <p className="text-xs text-destructive">
          {(lancamentos.error as any)?.message ?? "Falha ao carregar o extrato."}
        </p>
      )}

      {lancamentos.data && lancamentos.data.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem lançamentos.</p>
      )}

      {lancamentos.data && lancamentos.data.length > 0 && (
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.data.map((l, i) => {
                const credito = Number(l.sinal ?? 0) >= 0;
                return (
                  <TableRow key={`${l.titulo_id ?? l.ref}-${i}`}>
                    <TableCell className="text-xs">{dataBR(l.data)}</TableCell>
                    <TableCell className="text-xs">{l.tipo}</TableCell>
                    <TableCell className="text-xs">{l.ref ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.pedido_ref ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {dataBR(l.vencimento)}
                      {l.vencido_aberto && (
                        <span className="ml-1 text-[10px] text-destructive">vencido</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs font-medium",
                        credito ? "text-success" : "text-foreground",
                      )}
                    >
                      {credito ? "+" : "−"}
                      {formatBRL(Math.abs(Number(l.valor ?? 0)))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
