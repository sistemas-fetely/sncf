import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

export type LinhaTermo = {
  nf: string; sku: string; descricao: string; lote: string; validade: string;
  declarado: number; recebido: number; falta: number; excesso: number; nao_conforme: number; rnc: string;
};
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const textoOpcional = (s: string) => s.toUpperCase() === "N/A" ? "" : s;
const numero = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function parsearTermoEmail(html: string): LinhaTermo[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("HTML ilegível.");
  for (const tabela of Array.from(doc.querySelectorAll("table"))) {
    const trs = Array.from(tabela.querySelectorAll("tr"));
    for (let h = 0; h < trs.length; h++) {
      const cabecalho = Array.from(trs[h].querySelectorAll("th,td")).map((c) => normalizar(c.textContent ?? ""));
      if (!["DOCUMENTO", "ITEM", "DECLARADO"].every((c) => cabecalho.includes(c))) continue;
      const coluna = (...nomes: string[]) => cabecalho.findIndex((c) => nomes.includes(c));
      const mapa = {
        nf: coluna("DOCUMENTO"), sku: coluna("ITEM"), descricao: coluna("DESCRICAO"), lote: coluna("LOTE"),
        validade: coluna("VALIDADESERIE", "VALIDADE", "SERIE"), declarado: coluna("DECLARADO"),
        recebido: coluna("RECEBIDO"), falta: coluna("FALTA"), excesso: coluna("EXCESSO"),
        nao_conforme: coluna("NAOCONFORME"), rnc: coluna("RNC"),
      };
      const rows: LinhaTermo[] = [];
      for (const tr of trs.slice(h + 1)) {
        const cels = Array.from(tr.querySelectorAll("th,td"));
        const cel = (campo: keyof typeof mapa) => (cels[mapa[campo]]?.textContent ?? "").trim();
        const sku = cel("sku");
        const documento = cel("nf");
        if (normalizar(sku) === "ITEM" || (!documento && !sku)) continue;
        rows.push({
          nf: documento.split(".")[0], sku, descricao: cel("descricao"), lote: textoOpcional(cel("lote")),
          validade: textoOpcional(cel("validade")), declarado: numero(cel("declarado")), recebido: numero(cel("recebido")),
          falta: numero(cel("falta")), excesso: numero(cel("excesso")), nao_conforme: numero(cel("nao_conforme")),
          rnc: textoOpcional(cel("rnc")),
        });
      }
      if (!rows.length) throw new Error("0 linhas de conferência na tabela do e-mail.");
      return rows;
    }
  }
  throw new Error("Nenhuma tabela com DOCUMENTO/DECLARADO e ITEM no HTML.");
}

export function dataBrasilia(dataEmail: string): string {
  const data = new Date(dataEmail);
  if (!Number.isFinite(data.getTime())) throw new Error("Data do e-mail inválida ou ausente.");
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(data);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}