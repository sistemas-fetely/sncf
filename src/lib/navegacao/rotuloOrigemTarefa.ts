/**
 * Rótulo do "Voltar" da página da tarefa, conforme a tela de onde ela foi aberta.
 * Telas sem rótulo próprio caem em "Voltar".
 */
const ROTULOS: [RegExp, string][] = [
  [/^\/tarefas\/minhas(\/|$)/, "Minhas tarefas"],
  [/^\/tarefas\/hoje(\/|$)/, "Hoje"],
  [/^\/tarefas\/calendario(\/|$)/, "Calendário"],
  [/^\/tarefas\/projetos\/[^/]+/, "Projeto"],
  [/^\/tarefas\/projetos\/?$/, "Projetos"],
  [/^\/tarefas\/atribuicoes(\/|$)/, "Atribuições"],
  [/^\/tarefas\/dash(\/|$)/, "Tarefas"],
  [/^\/pedidos\//, "Pedido"],
  [/^\/tarefas\/[^/]+$/, "Tarefa"],
];

export function rotuloOrigemTarefa(pathname: string): string {
  for (const [re, rotulo] of ROTULOS) if (re.test(pathname)) return rotulo;
  return "Voltar";
}
