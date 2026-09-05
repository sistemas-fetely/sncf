/**
 * Detalhe da conta de UM cliente: cobertura, extrato e furos de trilha.
 * Somente leitura, exceto o botão de registrar recebimento (que já vem com o
 * cliente amarrado).
 */
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Separator } from "@/components/ui/separator";
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
import {
  useContaClienteCobertura,
  useContaClienteFuros,
  useContaClienteLancamentos,
  type ContaClienteSaldo,
} from "@/hooks/financeiro/useContaCliente";
import { RegistrarRecebimentoDialog } from "./RegistrarRecebimentoDialog";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

interface Props {
  conta: ContaClienteSaldo | null;
  onOpenChange: (open: boolean) => void;
}

export function ContaClienteDrawer({ conta, onOpenChange }: Props) {
  const parceiroId = conta?.parceiro_id ?? null;
  const cobertura = useContaClienteCobertura(parceiroId);
  const lancamentos = useContaClienteLancamentos(parceiroId);
  const furos = useContaClienteFuros(parceiroId);

  const saldo = Number(conta?.saldo ?? 0);

  return (
    <Sheet open={!!conta} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{conta?.nome_fantasia ?? "Cliente"}</SheetTitle>
          <SheetDescription>
            Conta do cliente — o dinheiro é do CNPJ, o pedido debita o saldo.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Saldo da conta</p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  saldo > 0 ? "text-success" : saldo < 0 ? "text-warning" : "",
                )}
              >
                {formatBRL(saldo)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {saldo > 0
                  ? "crédito a favor do cliente"
                  : saldo < 0
                    ? "cliente deve"
                    : "conta zerada"}
              </p>
            </div>
            {parceiroId && (
              <RegistrarRecebimentoDialog
                parceiroId={parceiroId}
                parceiroNome={conta?.nome_fantasia ?? null}
              >
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Registrar recebimento
                </Button>
              </RegistrarRecebimentoDialog>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">Vencido em aberto</p>
              <p className="text-sm font-medium">{formatBRL(conta?.vencido_em_aberto ?? 0)}</p>
            </div>
            <div className="rounded-md border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">A vencer</p>
              <p className="text-sm font-medium">{formatBRL(conta?.a_vencer ?? 0)}</p>
            </div>
            <div className="rounded-md border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">Crédito futuro (boleto)</p>
              <p className="text-sm font-medium">
                {formatBRL(conta?.credito_futuro_boleto ?? 0)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-medium">Cobertura</p>
            {cobertura.isLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> consultando
              </p>
            )}
            {cobertura.isError && (
              <p className="text-xs text-destructive">
                {(cobertura.error as any)?.message ?? "Falha ao consultar cobertura."}
              </p>
            )}
            {cobertura.data && (
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold">
                    {formatBRL(cobertura.data.cobertura_total)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">cobertura total</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <dt>Saldo disponível</dt>
                  <dd className="text-right text-foreground">
                    {formatBRL(cobertura.data.fonte1_saldo_disponivel)}
                  </dd>
                  <dt>Limite vigente</dt>
                  <dd className="text-right text-foreground">
                    {formatBRL(cobertura.data.limite_vigente)}
                  </dd>
                  <dt>Limite disponível</dt>
                  <dd className="text-right text-foreground">
                    {formatBRL(cobertura.data.fonte3_limite_disponivel)}
                  </dd>
                  <dt>Exposição em aberto</dt>
                  <dd className="text-right text-foreground">
                    {formatBRL(cobertura.data.exposicao_em_aberto)}
                  </dd>
                </dl>
                {cobertura.data.sinal_analise_credito && (
                  <Selo estado="warning">sinal para análise de crédito</Selo>
                )}
              </div>
            )}
          </div>

          {furos.data && furos.data.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Furos de trilha ({furos.data.length})
              </p>
              <div className="space-y-1.5">
                {furos.data.map((f, i) => (
                  <div
                    key={`${f.furo}-${f.ref}-${i}`}
                    className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Selo estado="destructive">{f.furo}</Selo>
                      <span className="text-xs font-medium">{formatBRL(f.valor)}</span>
                    </div>
                    {f.detalhe && (
                      <p className="text-[11px] text-muted-foreground mt-1">{f.detalhe}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium">Extrato</p>
            {lancamentos.isLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> carregando
              </p>
            )}
            {lancamentos.isError && (
              <p className="text-xs text-destructive">
                {(lancamentos.error as any)?.message ?? "Falha ao carregar extrato."}
              </p>
            )}
            {lancamentos.data && lancamentos.data.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem lançamentos.</p>
            )}
            {lancamentos.data && lancamentos.data.length > 0 && (
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
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
