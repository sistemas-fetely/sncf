export interface ReembolsoLoja {
  id: string;
  pedido_loja: string | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  cliente: string | null;
  data_reembolso: string | null;
  valor: number | null;
  meio: string | null;
  estorno: "pago" | "pendente";
  motivo: string | null;
  voltou_estoque: boolean;
  itens: number | null;
  valor_pedido: number | null;
  pedido_enviado: boolean;
  devolucao_id: string | null;
  devolucao_numero: string | null;
  devolucao_status: string | null;
  nf_dev_numero: string | null;
  situacao: "com_devolucao" | "cancelamento" | "sem_devolucao";
}

export type ColunaReembolso = "pedido_ref" | "data_reembolso" | "cliente" | "valor" | "meio" | "estorno" | "situacao";

export async function carregarReembolsosLoja(pagina: (de: number, ate: number) => Promise<ReembolsoLoja[]>) {
  const linhas: ReembolsoLoja[] = [];
  for (let de = 0; ; de += 1000) {
    const itens = await pagina(de, de + 999);
    linhas.push(...itens);
    if (itens.length < 1000) return linhas;
  }
}

export function filtrarReembolsosLoja(linhas: ReembolsoLoja[], filtros: { busca: string; situacao: string; estorno: string; mes: string }) {
  const q = filtros.busca.trim().toLocaleLowerCase("pt-BR");
  return linhas.filter((r) =>
    (filtros.situacao === "todas" || r.situacao === filtros.situacao) &&
    (filtros.estorno === "todos" || r.estorno === filtros.estorno) &&
    (filtros.mes === "todos" || r.data_reembolso?.slice(0, 7) === filtros.mes) &&
    (!q || [r.pedido_ref, r.pedido_loja, r.cliente, r.motivo].some((v) => (v ?? "").toLocaleLowerCase("pt-BR").includes(q))),
  );
}

export function ordenarReembolsosLoja(linhas: ReembolsoLoja[], coluna: ColunaReembolso, direcao: "asc" | "desc") {
  const valor = (r: ReembolsoLoja) => coluna === "pedido_ref" ? r.pedido_ref || r.pedido_loja : r[coluna];
  return [...linhas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
    if (vb == null || vb === "") return -1;
    const cmp = coluna === "valor" ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return cmp * (direcao === "asc" ? 1 : -1);
  });
}

export function resumirReembolsosLoja(linhas: ReembolsoLoja[]) {
  return linhas.reduce((r, item) => {
    const valor = Number(item.valor ?? 0);
    r.total += valor;
    if (item.estorno === "pago") { r.pagos += 1; r.valorPago += valor; }
    if (item.estorno === "pendente") { r.pendentes += 1; r.valorPendente += valor; }
    if (item.situacao === "sem_devolucao") r.semDevolucao += 1;
    return r;
  }, { total: 0, pagos: 0, valorPago: 0, pendentes: 0, valorPendente: 0, semDevolucao: 0 });
}

export function destinoDevolucaoLoja(numero: string) {
  return `/devolucoes?${new URLSearchParams({ aba: "funil", q: numero })}`;
}