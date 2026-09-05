import { useCallback, useMemo, useState } from "react";
import { useNaturezasTarefa, type NaturezaTarefa } from "./useTarefasCatalogos";

/**
 * Filtro de natureza das listas de trabalho do dia.
 * Por padrão só aparece o que a dimensão marca como na_lista_de_trabalho —
 * épico de produto e backlog de dev saem da lista sem serem apagados.
 * Separar não é esconder: o controle é visível e mostra quantas ficaram de fora.
 */

export interface TarefaComNatureza {
  id: string;
  natureza?: string | null;
  /** vem pronto da view; quando ausente, a regra é lida da dimensão */
  na_lista_de_trabalho?: boolean | null;
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

  const filtrar = useCallback(
    <T extends TarefaComNatureza>(lista: T[]): T[] =>
      incluirTodas ? lista : lista.filter(naListaDeTrabalho),
    [incluirTodas, naListaDeTrabalho]
  );

  const contarOcultas = useCallback(
    (...listas: (TarefaComNatureza[] | undefined)[]): number =>
      listas.flatMap((l) => l ?? []).filter((t) => !naListaDeTrabalho(t)).length,
    [naListaDeTrabalho]
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
