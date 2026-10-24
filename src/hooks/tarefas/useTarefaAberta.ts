import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { abrirDetalhe } from "@/lib/navegacao/abrirDetalhe";
import { rotuloOrigemTarefa } from "@/lib/navegacao/rotuloOrigemTarefa";

/**
 * A tarefa aberta mora na URL (?tarefa=<id>), nunca no estado de uma linha de lista.
 *
 * Por quê: o painel de detalhe estava montado DENTRO do TarefaItem. Ao salvar um campo
 * (autosave), a query invalidava, a tarefa saía do filtro e a linha desmontava — levando
 * a gaveta junto no meio do preenchimento.
 *
 * Efeito colateral bom: notif_url_tarefa() já aponta para ?tarefa= desde 15/08.
 *
 * FICHA-DA-TAREFA (19/09/2026): `abrir` NAVEGA para /tarefas/:id — a tarefa tem
 * página própria. A assinatura do hook não mudou, então todo call site herda o
 * novo comportamento sem edição. `?tarefa=` de link antigo continua sendo lido.
 *
 * TELA-LEMBRA-ONDE-EU-ESTAVA: `abrir` leva `from` (query + foco no cartão) e o
 * rótulo da tela de origem, para o Voltar da página da tarefa voltar certo.
 */
export function useTarefaAberta() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const abrir = useCallback(
    (id: string, label?: string) =>
      abrirDetalhe(navigate, location, `/tarefas/${id}`, {
        foco: id,
        label: label ?? rotuloOrigemTarefa(location.pathname),
      }),
    [navigate, location],
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
