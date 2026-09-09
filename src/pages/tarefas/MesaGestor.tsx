// Mesa do Gestor — declarar o trabalho e ler o resultado são dois lados da mesma coisa,
// por isso vivem na MESMA tela, em três abas (ABA-VIA-URL, ?aba=).
//  - Time        → carga por pessoa (leitura)
//  - Atribuições → catálogo do time (declaração)
//  - Carga       → pressão das filas (prioridade)
// As rotas antigas /tarefas/atribuicoes e /tarefas/carga redirecionam para cá.
import { Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import PainelTime from "@/components/tarefas/mesa/PainelTime";
import PainelAtribuicoes from "@/components/tarefas/mesa/PainelAtribuicoes";
import PainelCarga from "@/components/tarefas/mesa/PainelCarga";

export default function MesaGestor() {
  const [aba, setAba] = useAbaUrl("time");

  return (
    <PageShell>
      <PageHeader
        titulo="Mesa do Gestor"
        icone={Users}
        estado="carga do time, catálogo de atribuições e pressão das filas no mesmo lugar"
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="atribuicoes">Atribuições</TabsTrigger>
          <TabsTrigger value="carga">Carga</TabsTrigger>
        </TabsList>

        <TabsContent value="time" className="space-y-4">
          <PainelTime onDeclarar={() => setAba("atribuicoes")} />
        </TabsContent>

        <TabsContent value="atribuicoes" className="space-y-4">
          <PainelAtribuicoes />
        </TabsContent>

        <TabsContent value="carga" className="space-y-4">
          {aba === "carga" && <PainelCarga />}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

