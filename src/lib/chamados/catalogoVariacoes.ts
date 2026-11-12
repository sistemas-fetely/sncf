export interface VariacaoCatalogo {
  codigo: string;
  nome: string;
  descricao: string | null;
  libera_refaturamento: boolean;
}

interface ServicoBuscavel {
  codigo: string | null;
  item: string | null;
  descricao: string | null;
  fila: string | null;
  variacoes?: VariacaoCatalogo[] | null;
}

export function normalizarBuscaServico(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function buscarServico(item: ServicoBuscavel, busca: string) {
  const termo = normalizarBuscaServico(busca);
  const contem = (texto: string | null) => normalizarBuscaServico(texto ?? "").includes(termo);
  const variacao = termo
    ? (item.variacoes ?? []).find((v) => contem(v.nome) || contem(v.descricao)) ?? null
    : null;
  return {
    encontrado: !termo || [item.item, item.descricao, item.fila].some(contem) || !!variacao,
    variacao,
  };
}

export function codigoAssuntoSelecionado(item: ServicoBuscavel, variacao: VariacaoCatalogo | null): string | null {
  if (!item.variacoes?.length) return item.codigo;
  return item.variacoes.find((v) => v.codigo === variacao?.codigo)?.codigo ?? null;
}

export function assuntoComVariacao(assunto: string | null, variacao: string | null | undefined): string {
  return variacao ? `${assunto ?? "—"} · ${variacao}` : assunto ?? "—";
}

export function codigoVariacaoValido(codigo: string): boolean {
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(codigo);
}