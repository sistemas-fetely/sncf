/** Formatação compartilhada das telas de comissão. */

export function fmtBRL(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** Percentual: 0 casas quando inteiro, até 4 casas quando houver decimal relevante. */
export function fmtPct(v: number | string | null | undefined, sufixo = "%"): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  const txt = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
  return `${txt}${sufixo}`;
}

export function fmtPP(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0 p.p.";
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${fmtPct(n, "")} p.p.`;
}

export function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function fmtCompetencia(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

/** 'bloqueada:cliente sem vendedor' → 'Cliente sem vendedor' */
export function motivoBloqueio(situacao: string | null | undefined): string | null {
  if (!situacao || !situacao.startsWith("bloqueada")) return null;
  const motivo = situacao.split(":").slice(1).join(":").trim().replace(/_/g, " ");
  if (!motivo) return "Motivo não informado pelo banco";
  return motivo.charAt(0).toUpperCase() + motivo.slice(1);
}

export function isBloqueada(situacao: string | null | undefined): boolean {
  return !!situacao && situacao.startsWith("bloqueada");
}
