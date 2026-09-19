/**
 * FONTE ÚNICA da prioridade de tarefa — rótulo, selo e o ponto de urgente.
 *
 * Prioridade é DADO CADASTRAL, não estado: ela descreve a tarefa, não em que
 * ponto do fluxo ela está. `media` é o default da coluna `tarefas.prioridade` e
 * responde por 76% das tarefas — selo em quase tudo é ruído, não sinal. Por isso
 * `media` NÃO tem classe aqui: AUSÊNCIA DE SELO SIGNIFICA MÉDIA.
 *
 * Este módulo existe porque a regra estava copiada em cada tela: mudar o board
 * não mudava o resto. Quem for pintar prioridade importa daqui — não declara mapa
 * próprio. Só tokens (`destructive`, `warning`, `muted`); `media` não recebe cor
 * nem `info`.
 */

export const PRIORIDADE_ROTULO: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Sem a chave `media` de propósito: ausência de classe = ausência de selo. */
export const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

/** Média é o default do cadastro: mostrar selo nela seria pintar o silêncio. */
export function mostrarSeloPrioridade(p: string): boolean {
  return p !== "media";
}
