import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

export type CabecalhoCampo = {
  aba: string; ordem: number; coluna: string; campo_tecnico: string | null;
  sistema: string | null; owner: string | null; obrigatoriedade: string | null;
  bloco: string | null; rotulo: string | null; integracao: string | null;
};
type Linha = Record<string, unknown>;
export const ABAS_EXPORT = [
  { chave: "sncf_fop", nome: "SNCF & FOP", view: "vw_produto_export_sncf_fop" },
  { chave: "bling", nome: "Bling", view: "vw_produto_export_bling" },
  { chave: "shopify", nome: "Shopify", view: "vw_produto_export_shopify" },
] as const;
const ROTULOS = ["Sistema", "Owner · obrigatoriedade", "Bloco", "Campo técnico", "Integração hoje", "% preenchido hoje", "Rótulo"];
const CORES = {
  compartilhado: "0E5E6F", sncf: "1F3864", fop: "6A1B9A", bling: "2E7D32", shopify: "5A7D2A",
  operacoes: "DDEBF7", produto: "FCE4EC", sistema: "EDEDED", gerado: "E2EFDA", indefinido: "FFF2CC",
  bloco: "F2F2F2", rotulo: "D9D9D9", lateral: "404040", branco: "FFFFFF", cinza: "666666", vazio: "FBE5D6",
};

export function valorPreenchido(valor: unknown): boolean {
  if (valor == null || valor === "") return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === "object" && !(valor instanceof Date)) return Object.keys(valor).length > 0;
  return true;
}

export function valorExcel(valor: unknown): ExcelJS.CellValue {
  if (!valorPreenchido(valor)) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") return valor;
  if (typeof valor === "string") {
    // Only unambiguous ISO dates are dates; identifiers (including leading zeros) remain text.
    if (/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(valor)) {
      const data = new Date(valor);
      if (!Number.isNaN(data.getTime())) return data;
    }
    return valor.slice(0, 32_000);
  }
  return JSON.stringify(valor).slice(0, 32_000);
}

function corSistema(sistema: string): string | undefined {
  if (sistema === "SNCF + FOP") return CORES.compartilhado;
  if (sistema.startsWith("SNCF")) return CORES.sncf;
  if (sistema.startsWith("FOP")) return CORES.fop;
  if (sistema.startsWith("Bling")) return CORES.bling;
  if (sistema.startsWith("Shopify")) return CORES.shopify;
}
function corOwner(owner: string): string | undefined {
  const texto = owner.toLocaleLowerCase("pt-BR");
  if (texto.includes("sem dono") || texto.includes("não definido")) return CORES.indefinido;
  if (texto.includes("gerado") || texto.includes("calculado")) return CORES.gerado;
  if (owner.startsWith("Operações")) return CORES.operacoes;
  if (owner.startsWith("Produto (Thomer)")) return CORES.produto;
  if (owner.startsWith("Sistema")) return CORES.sistema;
}
function fundo(cell: ExcelJS.Cell, cor: string | undefined) {
  if (cor) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${cor}` } };
}

export type LerPagina = (view: string, inicio: number, fim: number, cabecalho: boolean) => Promise<Linha[]>;
const lerPagina: LerPagina = async (view, inicio, fim, cabecalho) => {
  let query = supabase.from(view as any).select("*");
  query = cabecalho ? query.order("aba").order("ordem") : query.order("cod_cadastro");
  // External views can contain multiple cards per SNCF code: stable tie-breakers avoid page overlaps.
  if (view === "vw_produto_export_bling") query = query.order("id");
  if (view === "vw_produto_export_shopify") query = query.order("product_id").order("variant_id");
  const { data, error } = await query.range(inicio, fim);
  if (error) throw new Error(`${view}: ${error.message}`);
  if (!data) throw new Error(`${view}: leitura sem resposta`);
  return data as unknown as Linha[];
};
export async function lerTodasLinhas(view: string, ler: LerPagina = lerPagina, cabecalho = false): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const pagina = await ler(view, inicio, inicio + 999, cabecalho);
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

export function criarWorkbookCampos(cabecalhos: CabecalhoCampo[], dados: Record<string, Linha[]>, agora = new Date()) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fetely";
  wb.created = agora;
  for (const aba of ABAS_EXPORT) {
    const campos = cabecalhos.filter(c => c.aba === aba.chave).sort((a, b) => a.ordem - b.ordem);
    if (!campos.length) throw new Error(`Cabeçalho não encontrado para ${aba.nome}`);
    if (new Set(campos.map(c => c.coluna)).size !== campos.length) throw new Error(`Colunas duplicadas em ${aba.nome}`);
    const linhas = dados[aba.chave];
    if (!linhas) throw new Error(`Dados não encontrados para ${aba.nome}`);
    for (const campo of campos) {
      if (linhas.some(l => !Object.prototype.hasOwnProperty.call(l, campo.coluna))) {
        throw new Error(`${aba.nome}: coluna ${campo.coluna} ausente na leitura`);
      }
    }
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: "frozen", xSplit: 1, ySplit: 7, topLeftCell: "B8", activeCell: "B8" }] });
    ws.getColumn(1).width = 27;
    campos.forEach((campo, i) => {
      ws.getColumn(i + 2).width = 20;
      const preenchidos = linhas.filter(l => valorPreenchido(l[campo.coluna])).length;
      const percentual = linhas.length ? Math.round(preenchidos / linhas.length * 100) : 0;
      const valores = [campo.sistema, [campo.owner, campo.obrigatoriedade].filter(Boolean).join(" · "), campo.bloco,
        campo.campo_tecnico, campo.integracao, `${percentual}% (${preenchidos}/${linhas.length})`, campo.rotulo];
      valores.forEach((v, r) => {
        const cell = ws.getCell(r + 1, i + 2);
        cell.value = v ?? "";
        cell.font = { name: "Arial", size: 9 };
        cell.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
      });
      const sistema = ws.getCell(1, i + 2);
      fundo(sistema, corSistema(campo.sistema ?? ""));
      sistema.font = { name: "Arial", size: 9, bold: true, color: { argb: `FF${CORES.branco}` } };
      fundo(ws.getCell(2, i + 2), corOwner(campo.owner ?? ""));
      fundo(ws.getCell(3, i + 2), CORES.bloco);
      ws.getCell(3, i + 2).font = { name: "Arial", size: 9, italic: true };
      ws.getCell(4, i + 2).font = { name: "Courier New", size: 9, color: { argb: `FF${CORES.cinza}` } };
      ws.getCell(5, i + 2).font = { name: "Arial", size: 8 };
      if (!preenchidos) fundo(ws.getCell(6, i + 2), CORES.vazio);
      fundo(ws.getCell(7, i + 2), CORES.rotulo);
      ws.getCell(7, i + 2).font = { name: "Arial", size: 9, bold: true };
    });
    ROTULOS.forEach((rotulo, i) => {
      const cell = ws.getCell(i + 1, 1);
      cell.value = rotulo;
      fundo(cell, CORES.lateral);
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: `FF${CORES.branco}` } };
      cell.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
      ws.getRow(i + 1).height = [34, 48, 32, 42, 64, 28, 42][i];
    });
    for (const linha of linhas) {
      const row = ws.addRow([null, ...campos.map(c => valorExcel(linha[c.coluna]))]);
      row.font = { name: "Arial", size: 9 };
      row.eachCell(cell => { if (cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy hh:mm"; });
    }
    ws.autoFilter = { from: { row: 7, column: 2 }, to: { row: 7 + linhas.length, column: campos.length + 1 } };
  }
  const legenda = wb.addWorksheet("Legenda");
  legenda.getColumn(1).width = 125;
  [
    "Linha 1 — Sistema: onde o campo mora.",
    "Linha 2 — Owner: azul Operações; rosa Produto/Thomer; cinza Sistema; verde gerado pelo sistema externo; amarelo sem dono = decidir.",
    "· via SNCF = alimentado pelo SNCF a partir do campo indicado na Integração.",
    "Integração (só na criação) = o SNCF grava ao criar e não corrige depois.",
    "Colunas do Shopify vazias marcadas como metacampo/SEO/coleções = ainda não espelhadas no SNCF.",
    'A aba Bling mostra a última leitura de cada card (coluna "Lido do Bling em").',
    "", `Exportado em ${agora.toLocaleString("pt-BR")}`,
  ].forEach(texto => {
    const row = legenda.addRow([texto]);
    row.font = { name: "Arial", size: 9 };
    row.alignment = { wrapText: true, vertical: "middle" };
    row.height = 30;
  });
  return wb;
}

export async function exportCamposPorSistema(ler: LerPagina = lerPagina) {
  const cabecalhos = await lerTodasLinhas("vw_produto_export_cabecalho", ler, true) as unknown as CabecalhoCampo[];
  const respostas = await Promise.all(ABAS_EXPORT.map(aba => lerTodasLinhas(aba.view, ler)));
  const dados = Object.fromEntries(ABAS_EXPORT.map((aba, i) => [aba.chave, respostas[i]]));
  const agora = new Date();
  const wb = criarWorkbookCampos(cabecalhos, dados, agora);
  const buffer = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nome: `Fetely_Campos_Produto_por_Sistema_${agora.toISOString().slice(0, 10)}.xlsx`,
    totais: ABAS_EXPORT.map((aba, i) => `${aba.nome}: ${respostas[i].length} linhas`).join(" · "),
  };
}