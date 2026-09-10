import { useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Percent } from "lucide-react";
import { AbaApurar } from "./AbaApurar";
import { AbaApuradas } from "./AbaApuradas";
import { AbaExtrato } from "./AbaExtrato";
import { AbaRegras } from "./AbaRegras";

export default function ComissoesIndex() {
  const [aba, setAba] = useState("apurar");

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Comissões" }]}
        titulo="Comissões de Representante"
        icone={Percent}
        estado="A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="apurar">A apurar</TabsTrigger>
          <TabsTrigger value="apuradas">Apuradas</TabsTrigger>
          <TabsTrigger value="extrato">Extrato mensal</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="apurar" className="mt-4">
          <AbaApurar />
        </TabsContent>
        <TabsContent value="apuradas" className="mt-4">
          <AbaApuradas />
        </TabsContent>
        <TabsContent value="extrato" className="mt-4">
          <AbaExtrato />
        </TabsContent>
        <TabsContent value="regras" className="mt-4">
          <AbaRegras />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
