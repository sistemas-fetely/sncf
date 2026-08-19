import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A tarefa aberta mora na URL (?tarefa=<id>), nunca no estado de uma linha de lista.
 *
 * Por quê: o painel de detalhe estava montado DENTRO do TarefaItem. Ao salvar um campo
 * (autosave), a query invalidava, a tarefa saía do filtro e a linha desmontava — levando
 * a gaveta junto no meio do preenchimento.
 *
 * Efeito colateral bom: notif_url_tarefa() já aponta para ?tarefa= desde 15/08.
 */
export function useTarefaAberta() {
  const [params, setParams] = useSearchParams();

  const abrir = useCallback(
    (id: string) => {
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual);
          novo.set("tarefa", id);
          return novo;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const fechar = useCallback(() => {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.delete("tarefa");
        return novo;
      },
      { replace: true },
    );
  }, [setParams]);

  return { tarefaId: params.get("tarefa"), abrir, fechar };
}
