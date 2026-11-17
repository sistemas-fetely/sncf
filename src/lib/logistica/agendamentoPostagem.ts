export type AgendamentoPostagem = {
  agendado_para?: string | null;
  postagem_bloqueada?: boolean | null;
  liberado_para_postar?: boolean | null;
};

export function dataPostagemCurta(data: string | null | undefined): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}` : '—';
}

export function avisoPostagem(pedido: AgendamentoPostagem): string | undefined {
  return pedido.postagem_bloqueada ? `Postagem liberada só em ${dataPostagemCurta(pedido.agendado_para)}` : undefined;
}

export function ordenarDespacho<T extends AgendamentoPostagem>(pedidos: T[]): T[] {
  const prioridade = (p: T) => p.postagem_bloqueada ? 2 : p.liberado_para_postar ? 0 : 1;
  return [...pedidos].sort((a, b) => prioridade(a) - prioridade(b));
}