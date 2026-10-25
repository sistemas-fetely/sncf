import { ArrowLeftRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { TransferenciaInternaPainel } from "@/components/estoque/TransferenciaInternaPainel";

export default function TransferenciaInterna() {
  return (
    <PageShell variant="dados">
      <PageHeader titulo="Transferência interna" icone={ArrowLeftRight} />
      <TransferenciaInternaPainel />
    </PageShell>
  );
}
