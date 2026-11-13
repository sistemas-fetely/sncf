import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { ContaCorrenteFornecedor } from "@/lib/despesas/rotina";

/** Card de fornecedor em regime de conta corrente — desenho único usado na aba Hoje (Despesas) e em Contas a Pagar. */
export function ContaCorrenteFornecedorCard({ fornecedor }: { fornecedor: ContaCorrenteFornecedor }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4 text-card-foreground">
      <div className="min-w-0">
        <p className="break-words font-medium">{fornecedor.nome}</p>
        <p className="text-xs text-muted-foreground">Nota não gera título — a obrigação é o saldo</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Saldo devedor</p>
        <p className="text-2xl font-medium tabular-nums">{formatBRL(fornecedor.saldo)}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Vencido</p><p className={cn("text-sm font-medium tabular-nums", fornecedor.vencido > 0 && "text-destructive")}>{formatBRL(fornecedor.vencido)}</p></div>
        <div><p className="text-xs text-muted-foreground">A vencer</p><p className="text-sm font-medium tabular-nums">{formatBRL(fornecedor.a_vencer)}</p></div>
        <div><p className="text-xs text-muted-foreground">Sem vencimento na nota</p><p className="text-sm font-medium tabular-nums">{formatBRL(fornecedor.sem_vencimento)}</p></div>
      </div>
      <p className="break-words text-xs text-muted-foreground">
        Notas: {formatBRL(fornecedor.documentado)} · Pago: {formatBRL(fornecedor.pago)} · Último pagamento: {fornecedor.ultimo_pagamento ? formatDateBR(fornecedor.ultimo_pagamento) : "—"} · {fornecedor.notas_abertas} {fornecedor.notas_abertas === 1 ? "nota em aberto" : "notas em aberto"}
      </p>
    </div>
  );
}
