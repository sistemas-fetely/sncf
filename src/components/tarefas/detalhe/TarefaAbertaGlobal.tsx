import { TarefaDetalhePainel } from "@/components/tarefas/detalhe/TarefaDetalhePainel";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";

/** Único ponto de montagem do painel de detalhe da tarefa em todo o SNCF. */
export function TarefaAbertaGlobal() {
  const { tarefaId, fechar } = useTarefaAberta();

  return (
    <TarefaDetalhePainel
      tarefaId={tarefaId}
      aberto={!!tarefaId}
      onOpenChange={(v) => {
        if (!v) fechar();
      }}
    />
  );
}
