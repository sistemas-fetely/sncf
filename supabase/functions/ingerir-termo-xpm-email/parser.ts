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

const meses: Record<string, number> = {
  janeiro: 1, jan: 1, january: 1,
  fevereiro: 2, fev: 2, february: 2, feb: 2,
  marco: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  maio: 5, mai: 5, may: 5,
  junho: 6, jun: 6, june: 6,
  julho: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  setembro: 9, set: 9, september: 9, sep: 9, sept: 9,
  outubro: 10, out: 10, october: 10, oct: 10,
  novembro: 11, nov: 11, november: 11,
  dezembro: 12, dez: 12, december: 12, dec: 12,
};

function dataDoCabecalho(value: string): Date | null {
  const horario = "(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(am|pm)?";
  const formatos = [
    { regex: new RegExp(`(\\d{1,2})/(\\d{1,2})/(\\d{4})\\s+(?:(?:as|at)\\s+)?${horario}`, "i"), tipo: "numerico" },
    { regex: new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?([a-z]+)\\.?\\s+(?:de\\s+)?(\\d{4})\\s+(?:(?:as|at)\\s+)?${horario}`, "i"), tipo: "dia" },
    { regex: new RegExp(`([a-z]+)\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\s+(?:(?:as|at)\\s+)?${horario}`, "i"), tipo: "mes" },
  ];
  const candidatos = formatos.map(({ regex, tipo }) => ({ match: regex.exec(value), tipo }))
    .filter((c): c is { match: RegExpExecArray; tipo: string } => c.match !== null)
    .sort((a, b) => a.match.index - b.match.index);
  const primeiro = candidatos[0];
  if (!primeiro) return null;
  const { match, tipo } = primeiro;
  // Only weekday/spacing can precede the date; don't jump to another header.
  if (!/^[a-z\s.,>\-]*$/i.test(value.slice(0, match.index))) return null;
  const dia = Number(tipo === "mes" ? match[2] : match[1]);
  const mes = tipo === "numerico" ? Number(match[2]) : meses[tipo === "mes" ? match[1] : match[2]];
  const ano = Number(match[3]);
  let hora = Number(match[4]);
  const minuto = Number(match[5]);
  const segundo = Number(match[6] ?? 0);
  const periodo = match[7]?.toLowerCase();
  if (!mes || mes > 12 || dia < 1 || ano < 1000 || minuto > 59 || segundo > 59) return null;
  if (periodo) {
    if (hora < 1 || hora > 12) return null;
    hora = hora % 12 + (periodo === "pm" ? 12 : 0);
  } else if (hora > 23) return null;
  const local = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
  if (local.getUTCFullYear() !== ano || local.getUTCMonth() !== mes - 1 || local.getUTCDate() !== dia) return null;
  // The original headers are Brasília wall-clock time, never the runtime zone.
  return new Date(local.getTime() + 3 * 60 * 60 * 1000);
}

export function dataOriginalEncaminhado(html: string, text?: string): Date | null {
  const marcado = html.replace(/<[^>]+(?:id\s*=\s*["']divRplyFwdMsg["']|class\s*=\s*["'][^"']*gmail_quote[^"']*["'])[^>]*>/gi,
    "\n----- Original Message -----\n");
  const doc = new DOMParser().parseFromString(marcado.replace(/<\/?(?:br|p|div|tr|td|th|blockquote)\b[^>]*>/gi, "\n"), "text/html");
  const fontes = [doc?.body?.textContent ?? "", text ?? ""];
  for (const fonte of fontes) {
    const conteudo = fonte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00a0/g, " ").toLowerCase();
    // Explicit forwarding markers win over any dates in the sender's cover note.
    const explicito = /(?:-{2,}\s*(?:forwarded message|original message|mensagem (?:original|encaminhada))\s*-{2,}|(?:begin forwarded message|inicio da mensagem encaminhada)\s*:)/i.exec(conteudo);
    const implicito = /(?:^|\n)\s*>*\s*(?:(?:de|from)\s*:|em\s+(?=[a-z.,\s]*\d{1,2}\s+(?:de\s+)?[a-z]))/i.exec(conteudo);
    const marcador = explicito ?? implicito;
    if (!marcador) continue;
    const trecho = conteudo.slice(marcador.index);
    const cabecalho = /\b(?:(?:enviado|enviada)(?:\s+em)?|sent|data|date)\s*:|(?:^|\n)\s*>*\s*em\s+/i.exec(trecho);
    if (!cabecalho) continue;
    const data = dataDoCabecalho(trecho.slice(cabecalho.index + cabecalho[0].length, cabecalho.index + cabecalho[0].length + 400));
    if (data) return data;
  }
  return null;
}

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