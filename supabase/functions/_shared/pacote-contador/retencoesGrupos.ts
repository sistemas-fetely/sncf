// Grupos do bloco de retenções da competência M (retenção é devida pela data do pagamento).
// Puro, sem dependências Deno — testado em src/lib/contabil/retencoesGrupos.test.ts.
export type GrupoRetencao = "emitida" | "paga_no_mes" | "em_aberto";

/** Primeiro dia de `ini` (AAAA-MM-DD) recuado `meses` meses. */
export function recuarMeses(ini: string, meses: number): string {
  const [a, m] = ini.slice(0, 7).split("-").map(Number);
  const t = a * 12 + (m - 1) - meses;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/** Classifica uma NFS-e com retenção para a competência [ini, fim]; null = não pertence ao bloco. */
export function grupoRetencao(emissao: string, dataPagamento: string | null, ini: string, fim: string): GrupoRetencao | null {
  const e = emissao.slice(0, 10);
  if (e >= ini && e <= fim) return "emitida";
  if (e > fim) return null;
  if (dataPagamento) return dataPagamento >= ini && dataPagamento <= fim ? "paga_no_mes" : null;
  return e >= recuarMeses(ini, 12) ? "em_aberto" : null;
}

const mmaaaa = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ddmmaaaa = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Observação da planilha para o grupo (b). */
export function obsPagaNoMes(emissao: string, dataPagamento: string): string {
  return `emitida em ${mmaaaa(emissao)}, paga em ${ddmmaaaa(dataPagamento)}`;
}
