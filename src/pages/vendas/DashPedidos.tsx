import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";
import { PageHeader } from "@/components/layout/PageHeader";

import { PageShell } from "@/components/layout/PageShell";
export default function DashPedidos() {
  return (
    <PageShell>
      <PageHeader
        titulo="Dash de Pedidos"
        estado="Visão viva da carteira, do SLA e do que precisa ser cobrado hoje."
      />
      <PainelDashPedidos />
    </PageShell>
  );
}
