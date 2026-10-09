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

// Consulta de existência sempre limitada aos ids de um bloco da grid.
export async function pedidosComCandidato<T extends { id: string }>(
  carregarBloco: (inicio: number, fim: number) => Promise<T[]>,
  carregarIds: (ids: string[]) => Promise<{ pedido_id: string }[]>,
  tamanho = 500,
): Promise<T[]> {
  const encontrados: T[] = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const bloco = await carregarBloco(inicio, inicio + tamanho - 1);
    if (bloco.length === 0) break;
    const ids = new Set((await carregarIds(bloco.map((p) => p.id))).map((p) => p.pedido_id));
    encontrados.push(...bloco.filter((p) => ids.has(p.id)));
    if (bloco.length < tamanho) break;
  }
  return encontrados;
}