/**
 * Modelo ClickUp: quem tem filha é contêiner por consequência, e a folha é
 * onde o trabalho acontece. As telas que leem a TABELA `tarefas` não recebem
 * `eh_container` da view, então a inferência é feita no cliente: é contêiner
 * quem aparece como `parent_id` de outra tarefa da MESMA resposta.
 *
 * Na dúvida, mostrar: se a filha não veio na resposta, a mãe não é
 * identificada como contêiner e continua na lista.
 */

interface LinhaHierarquia {
  id: string;
  parent_id?: string | null;
}

/** ids que são mãe de alguma tarefa presente nas listas informadas */
export function idsDeContainer(...listas: (LinhaHierarquia[] | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const lista of listas) {
    for (const t of lista ?? []) {
      if (t.parent_id) ids.add(t.parent_id);
    }
  }
  return ids;
}

/** remove da lista as tarefas identificadas como contêiner */
export function semContainers<T extends LinhaHierarquia>(lista: T[], containers: Set<string>): T[] {
  return lista.filter((t) => !containers.has(t.id));
}
