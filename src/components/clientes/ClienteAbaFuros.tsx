/** Furos de trilha do cliente — tom de alerta, texto do banco. */
import { AlertTriangle, Loader2 } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import { useContaClienteFuros } from "@/hooks/financeiro/useContaCliente";

export function ClienteAbaFuros({ parceiroId }: { parceiroId: string }) {
  const furos = useContaClienteFuros(parceiroId);

  if (furos.isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> carregando
      </p>
    );
  }

  if (furos.isError) {
    return (
      <p className="text-xs text-destructive">
        {(furos.error as any)?.message ?? "Falha ao carregar os furos."}
      </p>
    );
  }

  if (!furos.data || furos.data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum furo de trilha neste cliente.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        {furos.data.length} {furos.data.length === 1 ? "furo" : "furos"} de trilha
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
            {f.ref && <p className="text-[11px] text-muted-foreground mt-1">{f.ref}</p>}
            {f.detalhe && <p className="text-[11px] text-muted-foreground mt-1">{f.detalhe}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
