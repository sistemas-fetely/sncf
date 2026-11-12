export interface OpcaoFiltroMultiplo {
  valor: string;
  rotulo: string;
  contagem: number;
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function opcoesVisiveis(opcoes: OpcaoFiltroMultiplo[], busca: string) {
  const termo = normalizar(busca);
  return opcoes.filter((opcao) => normalizar(opcao.rotulo).includes(termo));
}

export function estadoSelecaoVisivel(visiveis: OpcaoFiltroMultiplo[], selecionados: string[]): boolean | "indeterminate" {
  const quantidade = visiveis.filter((opcao) => selecionados.includes(opcao.valor)).length;
  if (!quantidade) return false;
  return quantidade === visiveis.length ? true : "indeterminate";
}

export function alternarVisiveis(visiveis: OpcaoFiltroMultiplo[], selecionados: string[]): string[] {
  const valores = new Set(visiveis.map((opcao) => opcao.valor));
  return estadoSelecaoVisivel(visiveis, selecionados) === true
    ? selecionados.filter((valor) => !valores.has(valor))
    : [...new Set([...selecionados, ...valores])];
}

export function resumoSelecao(opcoes: OpcaoFiltroMultiplo[], selecionados: string[]) {
  const quantidade = selecionados.length;
  if (!quantidade) return { tipo: "vazio" as const };
  const restantes = opcoes.filter((opcao) => !selecionados.includes(opcao.valor)).length;
  if (opcoes.length > 0 && restantes === 0) return { tipo: "todas" as const, quantidade: opcoes.length };
  if (quantidade === 1) return { tipo: "unica" as const, nome: opcoes.find((opcao) => opcao.valor === selecionados[0])?.rotulo ?? selecionados[0] };
  if (opcoes.length - restantes > opcoes.length / 2) return { tipo: "exceto" as const, quantidade: restantes };
  return { tipo: "quantidade" as const, quantidade };
}