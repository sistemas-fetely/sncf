/** Formatação compartilhada das telas de comissão. */

export function fmtBRL(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** Percentual compartilhado: nunca exibe mais de 2 casas decimais. */
export function fmtPct(
  v: number | string | null | undefined,
  sufixo = "%",
  minimumFractionDigits: 0 | 1 | 2 = 0,
): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  const txt = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits,
    maximumFractionDigits: 2,
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

/* --------- Janela de recebimento (mês anterior à competência de pagamento) --------- */

function mesDeCompetencia(v: string | null | undefined): { ano: number; mes: number } | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return null;
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

/** 2026-10-01 → "01/09 a 30/09/2026": mês anterior à competência (janela de recebimento do cliente). */
export function fmtJanelaRecebimento(competencia: string | null | undefined): string {
  const m = mesDeCompetencia(competencia);
  if (!m) return "—";
  const ini = new Date(m.ano, m.mes - 2, 1);
  const fim = new Date(m.ano, m.mes - 1, 0);
  const f = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${f(ini)} a ${f(fim)}/${fim.getFullYear()}`;
}

/** Mês da janela de recebimento (mês anterior à competência), como MM/AAAA. */
export function fmtMesRecebimento(competencia: string | null | undefined): string {
  const m = mesDeCompetencia(competencia);
  if (!m) return "—";
  const ini = new Date(m.ano, m.mes - 2, 1);
  return `${String(ini.getMonth() + 1).padStart(2, "0")}/${ini.getFullYear()}`;
}

/** true quando o fechamento já está liberado: 1º dia da competência <= hoje (data local). */
export function podeFecharCompetencia(competencia: string | null | undefined): boolean {
  const m = mesDeCompetencia(competencia);
  if (!m) return false;
  const primeiro = new Date(m.ano, m.mes - 1, 1);
  const hoje = new Date();
  return primeiro <= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
}

/** Data do 1º dia da competência em dd/mm/aaaa — quando o fechamento libera. */
export function liberaFechamentoEm(competencia: string | null | undefined): string {
  const m = mesDeCompetencia(competencia);
  if (!m) return "—";
  const d = new Date(m.ano, m.mes - 1, 1);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
