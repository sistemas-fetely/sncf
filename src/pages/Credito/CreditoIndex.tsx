import { FilaEntradaTable } from "@/components/credito/FilaEntradaTable";
import { NovaAnaliseModalDialog } from "@/components/credito/NovaAnaliseModalDialog";

export default function CreditoIndex() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Análise de Crédito</h1>
          <p className="text-sm text-muted-foreground">
            Fila de Entrada — pedidos aguardando triagem para envio à Análise.
          </p>
        </div>
        <NovaAnaliseModalDialog />
      </div>
      <FilaEntradaTable />
    </div>
  );
}
