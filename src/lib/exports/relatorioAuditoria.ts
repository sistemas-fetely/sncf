import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const TOL = 0.05;
const FMT_BRL = "R$ #,##0.00";
const FMT_PCT = "0.00%";
const FMT_DATA = "dd/mm/yyyy";
const FMT_TS = "dd/mm/yyyy hh:mm";

type Cell = XLSX.CellObject | null;

function txt(v: unknown): Cell {
  if (v === null || v === undefined || v === "") return null;
  return { t: "s", v: String(v) };
}
function num(v: unknown, z?: string): Cell {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return z ? { t: "n", v: n, z } : { t: "n", v: n };
}
function dinheiro(v: unknown): Cell {
  return num(v, FMT_BRL);
}
function pct(v: unknown): Cell {
  return num(v, FMT_PCT);
}
function data(v: unknown, comHora = false): Cell {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return null;
  return { t: "d", v: d, z: comHora ? FMT_TS : FMT_DATA };
}
function simNao(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  return { t: "s", v: v === true ? "Sim" : "Não" };
}

function nomeArquivo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `rel_auditoria_pedidos_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
}

interface ColDef {
  header: string;
  width: number;
}

function montarAba(cols: ColDef[], linhas: Cell[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  cols.forEach((c, i) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { t: "s", v: c.header };
  });
  linhas.forEach((linha, r) => {
    linha.forEach((cell, i) => {
      if (cell) ws[XLSX.utils.encode_cell({ r: r + 1, c: i })] = cell;
    });
  });
  const range = { s: { r: 0, c: 0 }, e: { r: linhas.length, c: Math.max(cols.length - 1, 0) } };
  ws["!ref"] = XLSX.utils.encode_range(range);
  ws["!cols"] = cols.map((c) => ({ wch: c.width }));
  ws["!freeze"] = { xSplit: "0", ySplit: "1" };
  // Congelamento (SheetJS grava via !freeze em alguns writers; !view cobre xlsx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)["!views"] = [{ ySplit: 1, state: "frozen", topLeftCell: "A2" }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  return ws;
}

const SELECT_PEDIDOS = `
  id, id_externo, data_pedido, recebido_em, recebido_via, origem, vendedor, estagio, area_atual,
  marcacao, prioridade_score, prioridade_motivo, forma_solicitada, condicao_solicitada,
  tipo_pagamento, link_pagamento, valor_bruto, desconto_pct, desconto_celebra_valor,
  bonus_pix_valor, valor_frete, frete_tipo, estimativa_frete_valor, valor_liquido,
  observacao, observacao_pedido, observacao_cliente, contexto_anotacoes,
  nf_numero, nf_data, data_entrega_prevista, peso_bruto_total, cubagem_total, caixas_estimadas,
  triado_em, pre_separacao_em, pre_faturado_em, exportado_bling_em, faturado_em, entregue_em,
  cancelado_em, bling_id_destino, bling_enviado_em, bling_envio_erro,
  cliente:parceiros_comerciais!pedidos_parceiro_id_fkey(razao_social, nome_fantasia, cnpj, cpf, cidade, uf),
  transportadora:parceiros_comerciais!pedidos_transportadora_id_fkey(razao_social),
  forma_pag:formas_pagamento!pedidos_forma_pagamento_id_fkey(nome, codigo),
  regra_pag:regras_pagamento_pedido!pedidos_regra_pagamento_id_fkey(nome, codigo),
  frete_tipo_ref:frete_tipos!pedidos_frete_tipo_fk(rotulo, entra_no_liquido),
  natureza:naturezas_operacao!pedidos_natureza_operacao_id_fkey(nome)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function lote<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function buscarPedidos(ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (const chunk of lote(ids, 200)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("pedidos")
      .select(SELECT_PEDIDOS)
      .in("id", chunk);
    if (error) throw error;
    out.push(...((rows || []) as Row[]));
  }
  return out;
}

async function buscarItens(ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (const chunk of lote(ids, 200)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("pedido_itens")
      .select("id, pedido_id, sku, descricao, quantidade, valor_unitario, valor_unitario_tabela, desconto_pct, subtotal, ordem")
      .in("pedido_id", chunk);
    if (error) throw error;
    out.push(...((rows || []) as Row[]));
  }
  return out;
}

const COLS_PEDIDOS: ColDef[] = [
  { header: "Pedido", width: 14 },
  { header: "ID Interno", width: 38 },
  { header: "Data Pedido", width: 12 },
  { header: "Recebido Em", width: 18 },
  { header: "Recebido Via", width: 14 },
  { header: "Origem", width: 16 },
  { header: "Vendedor", width: 22 },
  { header: "Estágio", width: 20 },
  { header: "Área Atual", width: 14 },
  { header: "Marcação", width: 18 },
  { header: "Risco", width: 10 },
  { header: "Motivo Risco", width: 30 },
  { header: "Cliente Razão Social", width: 38 },
  { header: "Cliente Nome Fantasia", width: 28 },
  { header: "CNPJ/CPF", width: 20 },
  { header: "Cidade", width: 20 },
  { header: "UF", width: 6 },
  { header: "Forma Solicitada", width: 20 },
  { header: "Condição Solicitada", width: 22 },
  { header: "Forma Pagamento (Sistema)", width: 24 },
  { header: "Código Forma", width: 16 },
  { header: "Regra Pagamento", width: 24 },
  { header: "Código Regra", width: 16 },
  { header: "Tipo Pagamento", width: 16 },
  { header: "Link Pagamento", width: 40 },
  { header: "Valor Bruto", width: 16 },
  { header: "Desconto % (Pedido)", width: 18 },
  { header: "Desconto Celebra (R$)", width: 18 },
  { header: "Bônus PIX (R$)", width: 16 },
  { header: "Desconto Total (R$)", width: 18 },
  { header: "Desconto Efetivo %", width: 18 },
  { header: "Valor Frete", width: 14 },
  { header: "Tipo Frete", width: 20 },
  { header: "Frete Entra no Líquido", width: 20 },
  { header: "Frete Estimado", width: 16 },
  { header: "Valor Líquido", width: 16 },
  { header: "Natureza Operação", width: 24 },
  { header: "Qtd Linhas Item", width: 14 },
  { header: "Soma Itens (R$)", width: 16 },
  { header: "Δ Itens × Bruto", width: 16 },
  { header: "Líquido Esperado", width: 16 },
  { header: "Δ Líquido", width: 14 },
  { header: "Status Auditoria", width: 18 },
  { header: "Motivo Divergência", width: 60 },
  { header: "Obs (observacao)", width: 60 },
  { header: "Obs Pedido", width: 60 },
  { header: "Obs Cliente", width: 60 },
  { header: "Contexto Anotações", width: 60 },
  { header: "Transportadora", width: 28 },
  { header: "NF Número", width: 14 },
  { header: "NF Data", width: 12 },
  { header: "Data Entrega Prevista", width: 18 },
  { header: "Peso Bruto Total", width: 16 },
  { header: "Cubagem Total", width: 14 },
  { header: "Caixas Estimadas", width: 16 },
  { header: "Triado Em", width: 18 },
  { header: "Pré-Separação Em", width: 18 },
  { header: "Pré-Faturado Em", width: 18 },
  { header: "Exportado Bling Em", width: 18 },
  { header: "Faturado Em", width: 18 },
  { header: "Entregue Em", width: 18 },
  { header: "Cancelado Em", width: 18 },
  { header: "Bling ID Destino", width: 18 },
  { header: "Bling Enviado Em", width: 18 },
  { header: "Bling Erro Envio", width: 60 },
];

const COLS_ITENS: ColDef[] = [
  { header: "Pedido", width: 14 },
  { header: "Cliente", width: 38 },
  { header: "Estágio", width: 20 },
  { header: "Ordem", width: 8 },
  { header: "SKU", width: 18 },
  { header: "Descrição", width: 46 },
  { header: "Quantidade", width: 12 },
  { header: "Vlr Unit Tabela", width: 16 },
  { header: "Vlr Unit Praticado", width: 16 },
  { header: "Desconto % (Registrado)", width: 20 },
  { header: "Desconto % (Recalculado)", width: 20 },
  { header: "Δ Desconto (p.p.)", width: 16 },
  { header: "Subtotal", width: 16 },
  { header: "Subtotal Esperado", width: 16 },
  { header: "Δ Subtotal", width: 14 },
  { header: "Status Item", width: 18 },
];

const COR_STATUS: Record<string, string> = {
  DIVERGENTE: "FFC00000",
  "SEM ITENS": "FFED7D31",
  "SEM REFERÊNCIA": "FFED7D31",
  OK: "FF1A7F37",
};

function statusCell(status: string): Cell {
  return {
    t: "s",
    v: status,
    s: { font: { color: { rgb: COR_STATUS[status] ?? "FF000000" }, bold: status !== "OK" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

export async function gerarRelatorioAuditoria(pedidoIds: string[]): Promise<number> {
  const ids = Array.from(new Set(pedidoIds.filter(Boolean)));
  if (ids.length === 0) return 0;

  const [pedidos, itens] = await Promise.all([buscarPedidos(ids), buscarItens(ids)]);

  const itensPorPedido = new Map<string, Row[]>();
  itens.forEach((it) => {
    const arr = itensPorPedido.get(it.pedido_id) || [];
    arr.push(it);
    itensPorPedido.set(it.pedido_id, arr);
  });

  const ordenados = [...pedidos].sort((a, b) =>
    String(a.id_externo ?? "").localeCompare(String(b.id_externo ?? ""), "pt-BR", { numeric: true }),
  );

  // ----- Aba Pedidos -----
  const linhasPedidos: Cell[][] = ordenados.map((p) => {
    const meus = itensPorPedido.get(p.id) || [];
    const qtdLinhas = meus.length;
    const somaItens = meus.reduce((s, it) => s + Number(it.subtotal || 0), 0);
    const bruto = Number(p.valor_bruto || 0);
    const celebra = Number(p.desconto_celebra_valor || 0);
    const pix = Number(p.bonus_pix_valor || 0);
    const descontoTotal = celebra + pix;
    const entraLiquido = p.frete_tipo_ref?.entra_no_liquido === true;
    const frete = Number(p.valor_frete || 0);
    const liquidoEsperado = bruto - celebra - pix + (entraLiquido ? frete : 0);
    const deltaItens = somaItens - bruto;
    const deltaLiquido = Number(p.valor_liquido || 0) - liquidoEsperado;

    const motivos: string[] = [];
    if (Math.abs(deltaItens) > TOL) motivos.push("Soma dos itens não bate com bruto");
    if (Math.abs(deltaLiquido) > TOL) motivos.push("Líquido fora da fórmula");
    const status = qtdLinhas === 0 ? "SEM ITENS" : motivos.length > 0 ? "DIVERGENTE" : "OK";

    const doc = p.cliente?.cnpj ?? p.cliente?.cpf ?? null;

    return [
      txt(p.id_externo),
      txt(p.id),
      data(p.data_pedido),
      data(p.recebido_em, true),
      txt(p.recebido_via),
      txt(p.origem),
      txt(p.vendedor),
      txt(p.estagio),
      txt(p.area_atual),
      txt(p.marcacao),
      num(p.prioridade_score),
      txt(p.prioridade_motivo),
      txt(p.cliente?.razao_social),
      txt(p.cliente?.nome_fantasia),
      doc ? { t: "s", v: String(doc), z: "@" } : null,
      txt(p.cliente?.cidade),
      txt(p.cliente?.uf),
      txt(p.forma_solicitada),
      txt(p.condicao_solicitada),
      txt(p.forma_pag?.nome),
      txt(p.forma_pag?.codigo),
      txt(p.regra_pag?.nome),
      txt(p.regra_pag?.codigo),
      txt(p.tipo_pagamento),
      txt(p.link_pagamento),
      dinheiro(p.valor_bruto),
      p.desconto_pct == null ? null : pct(Number(p.desconto_pct) / 100),
      dinheiro(p.desconto_celebra_valor),
      dinheiro(p.bonus_pix_valor),
      dinheiro(descontoTotal),
      bruto === 0 ? null : pct(descontoTotal / bruto),
      dinheiro(p.valor_frete),
      txt(p.frete_tipo_ref?.rotulo ?? p.frete_tipo),
      simNao(p.frete_tipo_ref?.entra_no_liquido ?? null),
      dinheiro(p.estimativa_frete_valor),
      dinheiro(p.valor_liquido),
      txt(p.natureza?.nome),
      num(qtdLinhas),
      dinheiro(somaItens),
      dinheiro(deltaItens),
      dinheiro(liquidoEsperado),
      dinheiro(deltaLiquido),
      statusCell(status),
      txt(motivos.join("; ")),
      txt(p.observacao),
      txt(p.observacao_pedido),
      txt(p.observacao_cliente),
      txt(p.contexto_anotacoes),
      txt(p.transportadora?.razao_social),
      txt(p.nf_numero),
      data(p.nf_data),
      data(p.data_entrega_prevista),
      num(p.peso_bruto_total),
      num(p.cubagem_total),
      num(p.caixas_estimadas),
      data(p.triado_em, true),
      data(p.pre_separacao_em, true),
      data(p.pre_faturado_em, true),
      data(p.exportado_bling_em, true),
      data(p.faturado_em, true),
      data(p.entregue_em, true),
      data(p.cancelado_em, true),
      txt(p.bling_id_destino),
      data(p.bling_enviado_em, true),
      txt(p.bling_envio_erro),
    ];
  });

  // ----- Aba Itens -----
  const metaPedido = new Map<string, Row>();
  ordenados.forEach((p) => metaPedido.set(p.id, p));

  const itensOrdenados = [...itens].sort((a, b) => {
    const pa = metaPedido.get(a.pedido_id);
    const pb = metaPedido.get(b.pedido_id);
    const c = String(pa?.id_externo ?? "").localeCompare(String(pb?.id_externo ?? ""), "pt-BR", {
      numeric: true,
    });
    if (c !== 0) return c;
    return Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
  });

  const linhasItens: Cell[][] = itensOrdenados.map((it) => {
    const p = metaPedido.get(it.pedido_id);
    const tabela = it.valor_unitario_tabela == null ? null : Number(it.valor_unitario_tabela);
    const unit = Number(it.valor_unitario || 0);
    const semReferencia = tabela === null || tabela === 0;
    const descRegistrado = it.desconto_pct == null ? null : Number(it.desconto_pct) / 100;
    const descRecalc = semReferencia ? null : 1 - unit / (tabela as number);
    const deltaDescPP =
      descRegistrado == null || descRecalc == null ? null : (descRegistrado - descRecalc) * 100;
    const subtotal = Number(it.subtotal || 0);
    const subtotalEsperado = Number(it.quantidade || 0) * unit;
    const deltaSubtotal = subtotal - subtotalEsperado;

    const status = semReferencia
      ? "SEM REFERÊNCIA"
      : Math.abs(deltaSubtotal) > TOL || (deltaDescPP != null && Math.abs(deltaDescPP) > 0.5)
        ? "DIVERGENTE"
        : "OK";

    return [
      txt(p?.id_externo),
      txt(p?.cliente?.razao_social),
      txt(p?.estagio),
      num(it.ordem),
      txt(it.sku),
      txt(it.descricao),
      num(it.quantidade),
      dinheiro(it.valor_unitario_tabela),
      dinheiro(it.valor_unitario),
      descRegistrado == null ? null : pct(descRegistrado),
      descRecalc == null ? null : pct(descRecalc),
      deltaDescPP == null ? null : num(deltaDescPP, "0.00"),
      dinheiro(subtotal),
      dinheiro(subtotalEsperado),
      dinheiro(deltaSubtotal),
      statusCell(status),
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, montarAba(COLS_PEDIDOS, linhasPedidos), "Pedidos");
  XLSX.utils.book_append_sheet(wb, montarAba(COLS_ITENS, linhasItens), "Itens");

  XLSX.writeFile(wb, nomeArquivo(), { cellDates: true, compression: true });

  return linhasPedidos.length;
}
