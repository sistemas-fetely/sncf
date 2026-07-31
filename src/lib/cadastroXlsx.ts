import * as XLSX from "xlsx";

/**
 * Builder da planilha de cadastro (catálogo Fetely) enviada ao lojista.
 * Extraído de TabelaCadastroDialog para reuso no e-mail do pedido.
 * Mesma lógica, mesmas colunas, mesmas larguras.
 */

export const COLUNAS_CADASTRO: { key: string; label: string }[] = [
  { key: "sku",                 label: "SKU" },
  { key: "ean",                 label: "EAN" },
  { key: "ncm",                 label: "NCM" },
  { key: "cest",                label: "CEST" },
  { key: "marca",               label: "Marca" },
  { key: "linha",               label: "Linha" },
  { key: "grupo",               label: "Grupo" },
  { key: "tipo",                label: "Tipo" },
  { key: "colecao",             label: "Coleção" },
  { key: "nome_comercial",      label: "Nome Comercial" },
  { key: "nome_completo",       label: "Nome Completo" },
  { key: "cor_nome",            label: "Cor (Nome)" },
  { key: "tamanho_numero",      label: "Tamanho (N°)" },
  { key: "descricao_produto",   label: "Descrição Produto" },
  { key: "tipo_embalagem",      label: "Tipo Embalagem" },
  { key: "material_descritivo", label: "Material" },
];

export type LinhaExport = Record<string, string | number>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildLinhas(itens: any[], prodMap: Map<string, any>): LinhaExport[] {
  const seen = new Set<string>();
  const result: LinhaExport[] = [];
  for (const item of itens) {
    if (!item.sku || seen.has(item.sku)) continue;
    seen.add(item.sku);
    const p = prodMap.get(item.sku) ?? {};
    result.push({
      sku:                  item.sku,
      ean:                  p.ean                 ?? "",
      ncm:                  p.ncm                 ?? "",
      cest:                 p.cest                ?? "",
      marca:                p.marca               ?? "FETELY",
      linha:                p.linha               ?? "",
      grupo:                p.grupo               ?? "",
      tipo:                 p.tipo                ?? "",
      colecao:              p.colecao             ?? "",
      nome_comercial:       p.nome_comercial      ?? item.descricao ?? "",
      nome_completo:        p.nome_completo       ?? "",
      cor_nome:             p.cor_nome            ?? "",
      tamanho_numero:       p.tamanho_numero      ?? "",
      descricao_produto:    p.descricao_produto   ?? "",
      tipo_embalagem:       p.tipo_embalagem      ?? "",
      material_descritivo:  p.material_descritivo ?? p.material ?? "",
    });
  }
  return result;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function buildWorkbook(linhas: LinhaExport[]) {
  const headers = COLUNAS_CADASTRO.map((c) => c.label);
  const rows = linhas.map((l) => COLUNAS_CADASTRO.map((c) => l[c.key] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = COLUNAS_CADASTRO.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos Fetely");
  return wb;
}
