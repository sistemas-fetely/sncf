export interface PortaoCandidato {
  pedido_id: string;
  meio: string;
  valor_origem: number;
  valor_esperado: number;
  origem_data: string | null;
  origem_descricao: string | null;
  origem_conta: string | null;
  dias_de_diferenca: number | null;
  identidade: string;
  situacao: string;
  motivo: string | null;
}

export const IDENTIDADE_CANDIDATO: Record<string, string> = {
  txid_do_portao: "TXID do portão", documento: "Documento do cliente",
  raiz_documento: "Raiz do documento", pagador_conhecido: "Pagador conhecido",
  sem_identidade: "Identidade não comprovada",
};
export const SITUACAO_CANDIDATO: Record<string, string> = {
  inequivoco: "Pagamento inequívoco", sem_instrumento: "Sem instrumento",
  alvo_fora_de_posicao: "Pedido fora da posição de pagamento",
  ambiguo_origem_serve_varios: "Origem serve a vários pedidos",
  ambiguo_varias_origens: "Várias origens possíveis",
  parcelas_divergem: "Parcelas divergentes", identidade_nao_provada: "Identidade não comprovada",
};

export function agruparCandidatos(linhas: PortaoCandidato[]) {
  const mapa = new Map<string, PortaoCandidato[]>();
  for (const linha of linhas) mapa.set(linha.pedido_id, [...(mapa.get(linha.pedido_id) ?? []), linha]);
  return mapa;
}

// A VIEW MANDA: vw_portao_candidato é o lado pequeno (dinheiro sem vínculo).
// Buscamos os pedido_id dela primeiro e consultamos a fila APENAS com esses ids,
// em lotes — nunca varremos a tabela de pedidos.
export async function pedidosComCandidato<T extends { id: string }>(
  carregarIdsCandidatos: () => Promise<{ pedido_id: string }[]>,
  carregarPedidos: (ids: string[]) => Promise<T[]>,
  tamanhoLote = 200,
): Promise<T[]> {
  const linhas = await carregarIdsCandidatos();
  const ids = [...new Set(linhas.map((l) => l.pedido_id))];
  if (ids.length === 0) return [];
  const encontrados: T[] = [];
  for (let i = 0; i < ids.length; i += tamanhoLote) {
    encontrados.push(...(await carregarPedidos(ids.slice(i, i + tamanhoLote))));
  }
  return encontrados;
}