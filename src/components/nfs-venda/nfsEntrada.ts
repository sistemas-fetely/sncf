export interface NfEntrada {
  id: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  emitida_por: "fetely" | "cliente";
  contraparte: string | null;
  contraparte_documento: string | null;
  valor: number | null;
  natureza_operacao: string | null;
  tipo_codigo: string | null;
  tipo_rotulo: string | null;
  tipo_cor: string | null;
  nf_venda_id: string | null;
  nf_venda_numero: string | null;
  nf_venda_serie: string | null;
  nf_venda_valor: number | null;
  pct_devolvido: number | null;
  vinculo_status: string | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  tem_xml: boolean;
}

export type ColunaEntrada = "numero" | "data_emissao" | "emitida_por" | "contraparte" | "tipo_rotulo" | "valor" | "nf_venda_numero" | "pedido_ref";

export async function carregarNfsEntrada(pagina: (de: number, ate: number) => Promise<NfEntrada[]>) {
  const notas: NfEntrada[] = [];
  for (let de = 0; ; de += 1000) {
    const itens = await pagina(de, de + 999);
    notas.push(...itens);
    if (itens.length < 1000) return notas;
  }
}

export function filtrarNfsEntrada(notas: NfEntrada[], filtros: { busca: string; emitida: string; tipo: string; mes: string }) {
  const q = filtros.busca.trim().toLocaleLowerCase("pt-BR");
  return notas.filter((n) =>
    (filtros.emitida === "todas" || n.emitida_por === filtros.emitida) &&
    (filtros.tipo === "todos" || (n.tipo_rotulo || n.tipo_codigo) === filtros.tipo) &&
    (filtros.mes === "todos" || n.data_emissao?.slice(0, 7) === filtros.mes) &&
    (!q || [n.numero, n.contraparte, n.nf_venda_numero].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(q))),
  );
}

export function ordenarNfsEntrada(notas: NfEntrada[], coluna: ColunaEntrada, direcao: "asc" | "desc") {
  const valor = (n: NfEntrada): string | number | null => coluna === "tipo_rotulo" ? n.tipo_rotulo || n.tipo_codigo : n[coluna];
  return [...notas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
    if (vb == null || vb === "") return -1;
    const comparacao = coluna === "valor" ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return comparacao * (direcao === "asc" ? 1 : -1);
  });
}

export function resumirNfsEntrada(notas: NfEntrada[]) {
  return notas.reduce((r, n) => ({ quantidade: r.quantidade + 1, valor: r.valor + Number(n.valor ?? 0), devolucao: r.devolucao + (n.tipo_codigo === "devolucao_venda" ? Number(n.valor ?? 0) : 0) }), { quantidade: 0, valor: 0, devolucao: 0 });
}

export function destinoVendaEntrada(numero: string) {
  return `/administrativo/contabilidade/nfs-venda?${new URLSearchParams({ aba: "notas", nf_busca: numero })}`;
}