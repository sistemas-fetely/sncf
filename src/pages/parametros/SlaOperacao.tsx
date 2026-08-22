import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { BlocoSlaXpm } from "@/components/parametros/BlocoSlaXpm";
import { BlocoSlaFase } from "@/components/parametros/BlocoSlaFase";
import { BlocoSlaFrete } from "@/components/parametros/BlocoSlaFrete";
import { BlocoSlaFeed } from "@/components/parametros/BlocoSlaFeed";

export default function SlaOperacao() {
  return (
    <PageShell variant="dados">
      <PageHeader
        titulo="SLA da Operação"
        estado="Prazos e limiares da operação, por área. Cada bloco tem um dono e uma unidade diferente — leia o aviso do bloco antes de alterar."
      />

      <BlocoSlaXpm />
      <BlocoSlaFase />
      <BlocoSlaFrete />
      <BlocoSlaFeed />
    </PageShell>
  );
}
