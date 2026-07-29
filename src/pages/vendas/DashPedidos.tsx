import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";

export default function DashPedidos() {
  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-serif">Dash de Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Visão viva da carteira, do SLA e do que precisa ser cobrado hoje.
        </p>
      </header>
      <PainelDashPedidos />
    </div>
  );
}
