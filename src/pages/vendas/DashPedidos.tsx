import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";

import { PageShell } from "@/components/layout/PageShell";
export default function DashPedidos() {
  return (
    <PageShell>
      <header>
        <h1 className="text-2xl font-serif">Dash de Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Visão viva da carteira, do SLA e do que precisa ser cobrado hoje.
        </p>
      </header>
      <PainelDashPedidos />
    </PageShell>
  );
}
