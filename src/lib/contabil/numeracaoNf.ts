/** Linha de fn_contabil_nf_numeracao e resumo usado no alerta do pacote. */
export type LinhaNumeracao = {
  emitente_cnpj: string | null;
  serie: string;
  numero: number;
  ocorrencia: "cancelada" | "inutilizada" | "nao_autorizada" | "buraco" | string;
  data_emissao: string | null;
  detalhe: string | null;
  prazo_inutilizacao: string | null;
  dentro_prazo: boolean | null;
};

export function resumirNumeracao(linhas: LinhaNumeracao[]) {
  const c = (o: string) => linhas.filter((l) => l.ocorrencia === o).length;
  const pend = linhas.filter((l) => (l.ocorrencia === "buraco" || l.ocorrencia === "nao_autorizada") && l.dentro_prazo === true);
  return {
    canceladas: c("cancelada"), inutilizadas: c("inutilizada"), naoAutorizadas: c("nao_autorizada"), buracos: c("buraco"),
    pendentesNoPrazo: pend.length,
    prazo: linhas.find((l) => l.prazo_inutilizacao)?.prazo_inutilizacao ?? null,
  };
}

/** Linha da aba Bloco K exatamente no layout pedido pelo escritório. */
export const CABECALHO_BLOCO_K = ["Código do produto", "Nome do produto", "Quantidade", "Valor unitário", "Unidade de medida", "NCM", "Estoque em poder de", "CNPJ do participante"];
export type LinhaBlocoK = {
  codigo_produto: string; produto: string; quantidade: number; valor_unitario: number | null;
  unidade: string | null; ncm: string | null; posse_rotulo: string; participante_cnpj: string | null;
};
export function linhaBlocoK(l: LinhaBlocoK): (string | number)[] {
  return [l.codigo_produto, l.produto, Number(l.quantidade ?? 0), Number(l.valor_unitario ?? 0),
    l.unidade ?? "SEM UNIDADE", l.ncm ?? "SEM NCM", l.posse_rotulo, l.participante_cnpj ?? ""];
}
