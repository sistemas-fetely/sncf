/** Pendências de trilha do cliente — tom de alerta, texto do banco. */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format-currency";
import { useContaClienteFuros } from "@/hooks/financeiro/useContaCliente";

export function ClienteAbaPendencias({ parceiroId }: { parceiroId: string }) {
  const furos = useContaClienteFuros(parceiroId);

  if (furos.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (furos.isError) {
    return (
      <p className="text-xs text-destructive">
        {(furos.error as any)?.message ?? "Falha ao carregar as pendências."}
      </p>
    );
  }

  if (!furos.data || furos.data.length === 0) {
    return (
      <EstadoVazio
        icone={CheckCircle2}
        mensagem="Nenhuma pendência de trilha neste cliente — a conta fecha com os títulos."
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <span className="tabular-nums">{furos.data.length}</span>{" "}
        {furos.data.length === 1 ? "pendência" : "pendências"} de trilha
      </p>
      <div className="space-y-1.5">
        {furos.data.map((f, i) => (
          <div
            key={`${f.furo}-${f.ref}-${i}`}
            className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <Selo estado="destructive">{f.furo}</Selo>
              <span className="text-xs font-medium tabular-nums">{formatBRL(f.valor)}</span>
            </div>
            {f.ref && <p className="text-[11px] text-muted-foreground mt-1">{f.ref}</p>}
            {f.detalhe && <p className="text-[11px] text-muted-foreground mt-1">{f.detalhe}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
