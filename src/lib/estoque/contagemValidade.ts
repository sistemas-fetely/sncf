import { paraDataISO } from "@/lib/data";

export interface UltimaContagem {
  sku: string;
  em: string;
  qtd: number;
  criadoPor: string | null;
  quem: string | null;
  contabil?: number | null;
}

export function diasDesdeContagem(em: string, hoje: string): number {
  const data = paraDataISO(em);
  if (!data) throw new Error("Data da última contagem inválida.");
  const utc = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(hoje) - utc(data)) / 86400000);
}

export function contagemNoPrazo(em: string | null | undefined, dias: number, hoje: string): boolean {
  return !!em && diasDesdeContagem(em, hoje) <= dias;
}

export function separarContagens<T extends { sku: string }>(produtos: T[], ultimas: Map<string, UltimaContagem>, sessao: Set<string>, dias: number, hoje: string) {
  const pendentes = produtos.filter((p) => !sessao.has(p.sku) && !contagemNoPrazo(ultimas.get(p.sku)?.em, dias, hoje));
  pendentes.sort((a, b) => {
    const da = ultimas.get(a.sku)?.em;
    const db = ultimas.get(b.sku)?.em;
    if (!da || !db) return da ? 1 : db ? -1 : a.sku.localeCompare(b.sku);
    return Date.parse(da) - Date.parse(db) || a.sku.localeCompare(b.sku);
  });
  const noPrazo = [...ultimas.values()].filter((u) => contagemNoPrazo(u.em, dias, hoje))
    .sort((a, b) => Date.parse(b.em) - Date.parse(a.em) || a.sku.localeCompare(b.sku));
  return { pendentes, noPrazo };
}