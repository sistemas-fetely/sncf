import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";

/**
 * FICHA-DA-TAREFA (19/09/2026): o painel deixou de ser montado globalmente —
 * ele virou peek e cada superfície o monta com estado local. O que sobra aqui é
 * a ponte dos links antigos: `?tarefa=<id>` (notificações e e-mails já enviados)
 * leva para /tarefas/:id, sem quebrar nada.
 */
export function TarefaAbertaGlobal() {
  const { tarefaId, fechar } = useTarefaAberta();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tarefaId) return;
    fechar();
    navigate(`/tarefas/${tarefaId}`, { replace: true });
  }, [tarefaId, fechar, navigate]);

  return null;
}
