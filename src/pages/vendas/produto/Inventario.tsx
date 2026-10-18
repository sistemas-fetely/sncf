import { ClipboardList } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ContagemCentroPainel } from "@/components/estoque/ContagemCentroPainel";

export default function Inventario() {
  return (
    <PageShell variant="dados">
      <PageHeader titulo="Inventário" icone={ClipboardList} />
      <ContagemCentroPainel />
    </PageShell>
  );
}
