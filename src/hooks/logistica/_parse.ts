// Destino no repo: src/hooks/logistica/_parse.ts
// Helpers de parsing compartilhados pelos importadores de logística (rastreio + Braspress).
// Mantido separado de useImportarFretesTransportadora (Ícaro) para NÃO tocar no hook que já funciona.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// número em formato BR ("2.350,74" | "396,29" | "12,00") -> number
export function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (s === "") return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  let n: string;
  if (temVirgula && temPonto) n = s.replace(/\./g, "").replace(",", ".");
  else if (temVirgula) n = s.replace(",", ".");
  else n = s;
  const f = parseFloat(n);
  return isNaN(f) ? null : f;
}

export function intVal(v: any): number | null {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
}

export function onlyDigits(v: any): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d === "" ? null : d;
}

// CNPJ vem como número no XLSX -> perde zero à esquerda. Sempre 14 dígitos.
export function padCnpj(v: any): string | null {
  const d = onlyDigits(v);
  return d ? d.padStart(14, "0") : null;
}

// Ícaro rastreio traz "3036041/" ou "3048066/103272" -> queremos o CT-e antes da "/"
export function cleanCte(v: any): string | null {
  const s = str(v);
  if (!s) return null;
  const p = s.split("/")[0].trim();
  return p === "" ? null : p;
}

// Braspress traz NF como "196, " -> "196". Também limpa o ="123" da Ícaro.
export function cleanNf(v: any): string | null {
  let s = str(v);
  if (!s) return null;
  s = s.replace(/^=\"?/, "").replace(/\"?$/, "").trim(); // ="123"
  s = s.replace(/[,;\s]+$/, "").trim(); // vírgula/; à direita
  return s === "" ? null : s;
}

// DATA-BR-CONVERTE-NA-ORIGEM: dd/mm/yyyy[ HH:MM[:SS]] OU Date do Excel -> ISO.
// Mesmo comportamento do hook de frete (constrói data local -> toISOString).
export function parseDataBR(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10) - 1;
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(ano, mes, dia, hh, mm, ss);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Acha o índice da linha de cabeçalho procurando por um token conhecido
// (Ícaro: header na linha 0; Braspress: banner nas linhas 0-6, header na 6).
export function acharLinhaHeader(rows: any[][], tokens: string[]): number {
  const alvo = tokens.map((t) => t.trim().toUpperCase());
  for (let i = 0; i < rows.length; i++) {
    const cels = (rows[i] || []).map((c) => (c == null ? "" : String(c).trim().toUpperCase()));
    if (alvo.every((t) => cels.includes(t))) return i;
  }
  return -1;
}
