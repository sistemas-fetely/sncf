// Mesa do Gestor — declarar o trabalho e ler o resultado são dois lados da mesma coisa,
// por isso vivem na MESMA tela, em duas abas (ABA-VIA-URL, ?aba=).
//  - Time        → carga por pessoa (leitura)
//  - Atribuições → catálogo do time (declaração)
// A tela antiga /tarefas/atribuicoes redireciona para cá com a aba certa.
import { Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import PainelTime from "@/components/tarefas/mesa/PainelTime";
import PainelAtribuicoes from "@/components/tarefas/mesa/PainelAtribuicoes";

export default function MesaGestor() {
  const [aba, setAba] = useAbaUrl("time");

  return (
    <PageShell>
      <PageHeader
        titulo="Mesa do Gestor"
        icone={Users}
        estado="carga do time e catálogo de atribuições no mesmo lugar"
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="atribuicoes">Atribuições</TabsTrigger>
        </TabsList>

        <TabsContent value="time" className="space-y-4">
          <PainelTime onDeclarar={() => setAba("atribuicoes")} />
        </TabsContent>

        <TabsContent value="atribuicoes" className="space-y-4">
          <PainelAtribuicoes />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
