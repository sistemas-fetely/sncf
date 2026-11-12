export interface PedidoFiscal {
  id: string; numero: string | number | null; numero_loja: string | null;
  data_pedido: string | null; cliente_nome: string | null; cliente_cnpj_cpf: string | null;
  valor_total: number | null; valor_frete: number | null;
  situacao_label: string | null; situacao_cor: string | null;
  nf_id: string | null; nf_numero: string | null; nf_serie: string | null;
  nf_situacao: string | null; nf_valor: number | null; nf_data_emissao: string | null;
  pedido_sncf_id: string | null; pedido_sncf_ref: string | null;
  nf_qtd: number | null; numero_loja_repetido: boolean | null;
  divergencia: FilaDivergencia | null;
  dias_pedido: number | null;
}

export type FilaDivergencia = "sem_nf" | "aberto_com_nf" | "cancelado_com_nf";
export const FILAS_DIVERGENCIA: { codigo: FilaDivergencia; titulo: string; descricao: string }[] = [
  { codigo: "sem_nf", titulo: "Sem NF", descricao: "Pedido fiscal sem nota autorizada." },
  { codigo: "aberto_com_nf", titulo: "Em aberto com NF", descricao: "A nota já foi autorizada e o pedido fiscal continua em aberto." },
  { codigo: "cancelado_com_nf", titulo: "Cancelado com NF", descricao: "Pedido fiscal cancelado com nota autorizada." },
];

export function resumirDivergencias(pedidos: PedidoFiscal[]) {
  return FILAS_DIVERGENCIA.map((fila) => {
    const itens = pedidos.filter((p) => p.divergencia === fila.codigo);
    return { ...fila, quantidade: itens.length, valor: itens.reduce((s, p) => s + Number(p.valor_total ?? 0), 0) };
  });
}

export function escolherFilaDivergencia(pedidos: PedidoFiscal[], escolhida: string): FilaDivergencia {
  if (FILAS_DIVERGENCIA.some((f) => f.codigo === escolhida)) return escolhida as FilaDivergencia;
  return FILAS_DIVERGENCIA.find((f) => pedidos.some((p) => p.divergencia === f.codigo))?.codigo ?? "sem_nf";
}

export type ColunaFiscal = "numero" | "numero_loja" | "data_pedido" | "dias_pedido" | "cliente_nome" | "valor_total" | "situacao_label" | "nf_numero" | "pedido_sncf_ref";
export interface FiltrosFiscais { busca: string; situacao: string; mes: string; nf: string }

export function filtrarPedidosFiscais(pedidos: PedidoFiscal[], filtro: FiltrosFiscais) {
  const busca = filtro.busca.trim().toLocaleLowerCase("pt-BR");
  return pedidos.filter((p) => {
    if (filtro.situacao !== "todas" && p.situacao_label !== filtro.situacao) return false;
    if (filtro.mes !== "todos" && p.data_pedido?.slice(0, 7) !== filtro.mes) return false;
    const comNf = Boolean(p.nf_id || p.nf_numero || Number(p.nf_qtd) > 0);
    if (filtro.nf === "com" && !comNf) return false;
    if (filtro.nf === "sem" && comNf) return false;
    return !busca || [p.numero, p.numero_loja, p.cliente_nome].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(busca));
  });
}

export function ordenarPedidosFiscais(pedidos: PedidoFiscal[], coluna: ColunaFiscal, direcao: "asc" | "desc") {
  const valor = (p: PedidoFiscal): string | number | null => {
    const v = p[coluna];
    if (v == null || v === "") return null;
    if (coluna === "data_pedido") return Number.isNaN(Date.parse(String(v))) ? null : Date.parse(String(v));
    return v;
  };
  return [...pedidos].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return cmp * (direcao === "asc" ? 1 : -1);
  });
}

export async function carregarPedidosFiscais(ler: (de: number, ate: number) => Promise<PedidoFiscal[]>) {
  const pedidos: PedidoFiscal[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = await ler(de, de + 999);
    pedidos.push(...pagina);
    if (pagina.length < 1000) return pedidos;
  }
}

export function destinoNfsVenda(search: string, pedidos = false) {
  if (!pedidos) return `/administrativo/contabilidade/nfs-venda${search}`;
  const params = new URLSearchParams(search);
  params.set("aba", "pedidos");
  return `/administrativo/contabilidade/nfs-venda?${params}`;
}