import { useCallback, useMemo, useState } from "react";
import { useNaturezasTarefa, type NaturezaTarefa } from "./useTarefasCatalogos";

/**
 * Filtro das listas de trabalho, em dois eixos:
 *
 * 1. Natureza — por padrão só aparece o que a dimensão marca como
 *    na_lista_de_trabalho; épico de produto e backlog de dev saem da lista
 *    sem serem apagados.
 * 2. Trabalho independente — subtarefa com o mesmo responsável da mãe é
 *    passo de checklist, não unidade de trabalho. Ela vive no detalhe da mãe.
 *
 * Separar não é esconder: os controles são visíveis e a contagem do que ficou
 * de fora aparece separada por motivo.
 */

export interface TarefaComNatureza {
  id: string;
  natureza?: string | null;
  /** vem pronto da view; quando ausente, a regra é lida da dimensão */
  na_lista_de_trabalho?: boolean | null;
  /** vem pronto da view; quando ausente, nada é filtrado por este eixo */
  trabalho_independente?: boolean | null;
}

export interface OcultasContagem {
  /** fora por natureza (épico, backlog) */
  porNatureza: number;
  /** fora por ser passo de outra tarefa (subtarefa do mesmo responsável) */
  porSerPasso: number;
  total: number;
}

export function useFiltroNatureza() {
  const [incluirTodas, setIncluirTodas] = useState(false);
  const { data: naturezas } = useNaturezasTarefa();

  const daLista = useMemo(
    () => new Set((naturezas ?? []).filter((n) => n.na_lista_de_trabalho).map((n) => n.codigo)),
    [naturezas]
  );

  const naturezaDe = useCallback(
    (t: TarefaComNatureza): string => t.natureza ?? "operacional",
    []
  );

  /** enquanto a dimensão não carrega, nada é filtrado — lista vazia por engano é pior */
  const naListaDeTrabalho = useCallback(
    (t: TarefaComNatureza) =>
      typeof t.na_lista_de_trabalho === "boolean"
        ? t.na_lista_de_trabalho
        : daLista.size === 0 || daLista.has(naturezaDe(t)),
    [daLista, naturezaDe]
  );

  /** quando a fonte não traz o campo, a tarefa passa — não inventamos a regra no front */
  const ehTrabalhoIndependente = useCallback(
    (t: TarefaComNatureza) =>
      typeof t.trabalho_independente === "boolean" ? t.trabalho_independente : true,
    []
  );

  const visivel = useCallback(
    (t: TarefaComNatureza) =>
      incluirTodas || (naListaDeTrabalho(t) && ehTrabalhoIndependente(t)),
    [incluirTodas, naListaDeTrabalho, ehTrabalhoIndependente]
  );

  const filtrar = useCallback(
    <T extends TarefaComNatureza>(lista: T[]): T[] => lista.filter(visivel),
    [visivel]
  );

  const contarOcultas = useCallback(
    (...listas: (TarefaComNatureza[] | undefined)[]): OcultasContagem => {
      const todas = listas.flatMap((l) => l ?? []);
      if (incluirTodas) return { porNatureza: 0, porSerPasso: 0, total: 0 };
      const porNatureza = todas.filter((t) => !naListaDeTrabalho(t)).length;
      const porSerPasso = todas.filter(
        (t) => naListaDeTrabalho(t) && !ehTrabalhoIndependente(t)
      ).length;
      return { porNatureza, porSerPasso, total: porNatureza + porSerPasso };
    },
    [incluirTodas, naListaDeTrabalho, ehTrabalhoIndependente]
  );

  const rotulo = useCallback(
    (codigo: string): string =>
      (naturezas ?? []).find((n) => n.codigo === codigo)?.nome ?? codigo,
    [naturezas]
  );

  return {
    incluirTodas,
    setIncluirTodas,
    filtrar,
    contarOcultas,
    naturezaDe,
    rotulo,
    naturezas: (naturezas ?? []) as NaturezaTarefa[],
  };
}
