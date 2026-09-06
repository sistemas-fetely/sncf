import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import {
  PermissaoTelaProvider, usePermissaoTelaContext, AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";
import { InboxFilas } from "@/components/tarefas/InboxFilas";

export default function TarefasDash() {
  return (
    <PermissaoTelaProvider slug="tela.tarefas">
      <TarefasDashConteudo />
    </PermissaoTelaProvider>
  );
}

function TarefasDashConteudo() {
  const { podeEditar } = usePermissaoTelaContext();

  return (
    <PageShell>
      <PageTitle
        titulo="Dash"
        estado="Filas da operação em tempo real"
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      <InboxFilas />
    </PageShell>
  );
}
