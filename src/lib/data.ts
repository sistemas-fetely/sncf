// src/lib/data.ts
// Doutrina 128 — HORA-É-BRASÍLIA
// Ponto único de verdade para data no frontend do SNCF.
// Regra: coluna `date` do Postgres chega como string "YYYY-MM-DD" e é DATA PURA,
// nunca instante. Coluna `timestamptz` chega como ISO completo e é INSTANTE.
// Os helpers abaixo aceitam os dois formatos e acertam nos dois.

const RE_DATA_PURA = /^\d{4}-\d{2}-\d{2}$/;

// en-CA formata como YYYY-MM-DD, que é o que queremos
const FMT_ISO_BRT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type EntradaData = string | Date | null | undefined;

/** Hoje em Brasília, como "YYYY-MM-DD". Substitui new Date().toISOString().slice(0,10). */
export function hojeISO(): string {
  return FMT_ISO_BRT.format(new Date());
}

/** Converte um instante (ou hoje) para a data em Brasília, como "YYYY-MM-DD". */
export function paraDataISO(v: EntradaData): string | null {
  if (!v) return null;
  if (typeof v === "string" && RE_DATA_PURA.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return FMT_ISO_BRT.format(d);
}

/**
 * Converte "YYYY-MM-DD" num Date à meia-noite LOCAL (não UTC).
 * Se receber ISO completo, delega ao construtor normal (já é instante correto).
 */
export function parseDataPura(v: EntradaData): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (RE_DATA_PURA.test(v)) {
    const [a, m, d] = v.split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Formata como dd/MM/yyyy. Aceita data pura ou timestamptz. */
export function fmtData(v: EntradaData, vazio = "—"): string {
  if (!v) return vazio;
  if (typeof v === "string" && RE_DATA_PURA.test(v)) {
    const [a, m, d] = v.split("-");
    return `${d}/${m}/${a}`;
  }
  const iso = paraDataISO(v);
  if (!iso) return vazio;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Formata como dd/MM/yyyy HH:mm em Brasília. Só use com timestamptz. */
export function fmtDataHora(v: EntradaData, vazio = "—"): string {
  if (!v) return vazio;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return vazio;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dias de hoje (Brasília) até a data. Negativo = já passou. */
export function diasAte(v: EntradaData): number | null {
  const alvo = paraDataISO(v);
  if (!alvo) return null;
  const [aa, am, ad] = alvo.split("-").map(Number);
  const [ha, hm, hd] = hojeISO().split("-").map(Number);
  const msAlvo = Date.UTC(aa, am - 1, ad);
  const msHoje = Date.UTC(ha, hm - 1, hd);
  return Math.round((msAlvo - msHoje) / 86400000);
}

/** true se a data já passou em relação a hoje em Brasília. */
export function estaVencido(v: EntradaData): boolean {
  const n = diasAte(v);
  return n !== null && n < 0;
}

/** Dias de atraso (0 se não está vencido). */
export function diasAtraso(v: EntradaData): number {
  const n = diasAte(v);
  return n !== null && n < 0 ? -n : 0;
}
