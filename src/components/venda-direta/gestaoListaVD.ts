import type { ClassificacaoVD, VdFase } from "./FunilVD";
import { correspondeFiltroVD, type FiltroGestaoVD } from "./filtroGestaoVD";
import { esconderEntreguesNaLista } from "@/lib/pedidos/entregues";

export interface PedidoGestaoVD extends ClassificacaoVD {
  id: string;
  id_externo: string | null;
  recebido_em: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor_liquido: number | null;
  pagamento: string | null;
  pagamento_confirmado_em: string | null;
  alerta_sem_pagamento: boolean | null;
  codigo_rastreio: string | null;
  bling_pedido_numero: string | number | null;
  nf_numero: string | number | null;
}

export type ColunaGestaoVD = "pedido" | "bling" | "data" | "cliente" | "cd" | "valor" | "estagio" | "dono" | "proxima_acao" | "pagamento" | "rastreio";
export const COLUNAS_GESTAO_VD: { coluna: ColunaGestaoVD; rotulo: string; inicial: "asc" | "desc"; largura: string }[] = [
  { coluna: "pedido", rotulo: "Pedido", inicial: "desc", largura: "7%" },
  { coluna: "bling", rotulo: "Bling", inicial: "desc", largura: "6%" },
  { coluna: "data", rotulo: "Data / Idade", inicial: "desc", largura: "9%" },
  { coluna: "cliente", rotulo: "Cliente", inicial: "asc", largura: "12%" },
  { coluna: "cd", rotulo: "CD", inicial: "asc", largura: "4%" },
  { coluna: "valor", rotulo: "Valor", inicial: "desc", largura: "8%" },
  { coluna: "estagio", rotulo: "Estágio", inicial: "asc", largura: "9%" },
  { coluna: "dono", rotulo: "Dono", inicial: "asc", largura: "6%" },
  { coluna: "proxima_acao", rotulo: "Próxima ação", inicial: "asc", largura: "14%" },
  { coluna: "pagamento", rotulo: "Pagamento", inicial: "desc", largura: "8%" },
  { coluna: "rastreio", rotulo: "Rastreio", inicial: "asc", largura: "7%" },
];

export function lerOrdemGestaoVD(texto: string): { coluna: ColunaGestaoVD; dir: "asc" | "desc" } | null {
  const [coluna, dir] = texto.split(":");
  const definicao = COLUNAS_GESTAO_VD.find((c) => c.coluna === coluna);
  return definicao && (dir === "asc" || dir === "desc") ? { coluna: definicao.coluna, dir } : null;
}

export function pagamentoGestaoVD(l: PedidoGestaoVD, devolvidos: ReadonlySet<string>): string {
  if (devolvidos.has(l.id)) return "devolvido";
  if (l.pagamento === "conta_corrente_socio" || l.pagamento === "bonificacao") return l.pagamento;
  return l.pagamento_confirmado_em ? "pago" : "aguardando";
}

export function recentesGestaoVD<T extends PedidoGestaoVD>(linhas: T[], agora = Date.now()): T[] {
  return linhas.filter((l) => l.fase !== "entregue" || (!!l.marcos?.entregue_em && agora - new Date(l.marcos.entregue_em).getTime() <= 30 * 24 * 3600 * 1000));
}

export function porCdGestaoVD<T extends PedidoGestaoVD>(linhas: T[], cd: string, centros: ReadonlyMap<string, string>): T[] {
  return cd === "todos" ? linhas : linhas.filter((l) => centros.get(l.id) === cd);
}

export function fasesGestaoVD(fases: VdFase[], linhas: PedidoGestaoVD[]) {
  return [...fases].sort((a, b) => {
    const grupo = (f: VdFase) => f.codigo === "cancelado" ? 2 : f.fora_do_fluxo ? 1 : 0;
    return grupo(a) - grupo(b) || a.ordem - b.ordem;
  }).map((f) => {
    const membros = linhas.filter((l) => l.fase === f.codigo);
    return { ...f, qtd: membros.length, valor: membros.reduce((v, l) => v + Number(l.valor_liquido ?? 0), 0), alertas: membros.filter((l) => l.alertas?.length || l.alerta_sem_pagamento).length };
  });
}

export function filtrarGestaoVD<T extends PedidoGestaoVD>(linhas: T[], filtros: { busca: string; filtro: FiltroGestaoVD | null; vendedora: string; pagamento: string }, devolvidos: ReadonlySet<string>): T[] {
  const termo = filtros.busca.trim().toLocaleLowerCase("pt-BR");
  const digitos = termo.replace(/\D/g, "");
  const esconderEntregues = esconderEntreguesNaLista({ mostrarEntregues: false, temBusca: !!termo, filtroDeEntregue: filtros.filtro?.tipo === "fase" && filtros.filtro.codigo === "entregue" });
  return linhas.filter((l) => {
    if (esconderEntregues && l.fase === "entregue") return false;
    if (!termo && l.fase === "cancelado" && !(filtros.filtro?.tipo === "fase" && filtros.filtro.codigo === "cancelado")) return false;
    if (!correspondeFiltroVD(l, filtros.filtro)) return false;
    if (filtros.vendedora !== "todas" && l.vendedor_id !== filtros.vendedora) return false;
    if (filtros.pagamento !== "todos" && pagamentoGestaoVD(l, devolvidos) !== filtros.pagamento) return false;
    if (!termo) return true;
    return [l.id_externo, l.cliente_nome, l.cliente_telefone, l.vendedor_nome, l.marcos?.bling_numero, l.bling_pedido_numero, l.marcos?.nf_numero, l.nf_numero, l.codigo_rastreio].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(termo)) || (digitos.length >= 3 && (l.cliente_telefone ?? "").replace(/\D/g, "").includes(digitos));
  });
}

export function ordenarGestaoVD<T extends PedidoGestaoVD>(linhas: T[], ordem: ReturnType<typeof lerOrdemGestaoVD>, centros: ReadonlyMap<string, string>, devolvidos: ReadonlySet<string>): T[] {
  if (!ordem) return linhas;
  const valor = (l: T): string | number => {
    switch (ordem.coluna) {
      case "pedido": return l.id_externo ?? "";
      case "bling": return String(l.marcos?.bling_numero ?? l.bling_pedido_numero ?? "");
      case "data": return l.recebido_em ? new Date(l.recebido_em).getTime() : 0;
      case "cliente": return l.cliente_nome ?? "";
      case "cd": return centros.get(l.id) ?? "";
      case "valor": return Number(l.valor_liquido ?? 0);
      case "estagio": return l.etapa_rotulo ?? "";
      case "dono": return l.responsavel_rotulo ?? "";
      case "proxima_acao": return l.proxima_acao ?? "";
      case "pagamento": return pagamentoGestaoVD(l, devolvidos);
      case "rastreio": return l.codigo_rastreio ?? "";
    }
  };
  return [...linhas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    const comparacao = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return (ordem.dir === "asc" ? comparacao : -comparacao) || a.id.localeCompare(b.id);
  });
}