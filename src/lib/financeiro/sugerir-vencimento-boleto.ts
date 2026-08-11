/**
 * Sugestão de vencimento para boleto ainda não registrado no Safra.
 *
 * Regra: parte de `pedidos.faturado_em` (o campo confiável — `data_emissao_nf`
 * está nula em 100% dos títulos pendentes) e soma o dia nominal da parcela
 * extraído da condição comercial ("0/30/60"). Nunca sugere data antes de
 * faturamento + 7 dias (gordura que impede a parcela "0 dias" nascer vencida).
 *
 * Retorna ISO yyyy-mm-dd, ou null quando não há como sugerir com segurança.
 */
export function extrairDiasCondicao(condicao: string | null | undefined): number[] | null {
  if (!condicao) return null;
  const m = condicao.match(/\d+(?:\s*\/\s*\d+)+/);
  if (!m) return null;
  const dias = m[0]
    .split("/")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return dias.length > 0 ? dias : null;
}

function somarDias(iso: string, dias: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function sugerirVencimentoBoleto(
  faturadoEm: string | null | undefined,
  condicaoSolicitada: string | null | undefined,
  numeroParcela: number | null | undefined,
  totalParcelas: number | null | undefined,
): string | null {
  if (!faturadoEm) return null;
  const baseIso = String(faturadoEm).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseIso)) return null;

  const dias = extrairDiasCondicao(condicaoSolicitada);
  if (!dias) return null;
  if (!totalParcelas || dias.length !== totalParcelas) return null;

  const parcela = numeroParcela ?? 1;
  if (parcela < 1 || parcela > dias.length) return null;

  const candidato = somarDias(baseIso, dias[parcela - 1]);
  const piso = somarDias(baseIso, 7);
  return candidato > piso ? candidato : piso;
}
