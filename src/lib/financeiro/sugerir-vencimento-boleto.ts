/**
 * Sugestão de vencimento para boleto ainda não registrado no Safra.
 *
 * ÂNCORA É A PARCELA 1, NÃO A NOTA. Uma condição "0/30/60/90" não quer dizer
 * "conte tudo a partir do faturamento" — quer dizer que o cliente paga a cada
 * 30 dias. Ancorar cada parcela no faturamento quebra o intervalo comercial
 * assim que a parcela 1 é empurrada pelo piso de 7 dias (ou pela mão do
 * operador): 0/30/60/90 vira 23/30/30. Por isso as parcelas 2..n são
 * calculadas somando à parcela 1 a DIFERENÇA entre os dias nominais.
 *
 * `faturado_em` é lido como DATA pura (os 10 primeiros caracteres do ISO).
 * Nunca converter para fuso local: 40 dos pedidos têm o campo gravado como
 * meia-noite UTC, e a conversão joga a data um dia para trás.
 */

/** Gordura mínima: nenhuma parcela nasce vencida ou com prazo impagável. */
const PISO_DIAS = 7;

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

/** Data de faturamento como DATA pura, sem conversão de fuso. */
export function dataFaturamentoIso(faturadoEm: string | null | undefined): string | null {
  if (!faturadoEm) return null;
  const iso = String(faturadoEm).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function somarDias(iso: string, dias: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Vencimento da parcela 1 pela regra pura: faturamento + dia nominal, com piso. */
export function vencimentoParcelaUm(
  faturadoEm: string | null | undefined,
  condicaoSolicitada: string | null | undefined,
): string | null {
  const base = dataFaturamentoIso(faturadoEm);
  const dias = extrairDiasCondicao(condicaoSolicitada);
  if (!base || !dias) return null;
  const candidato = somarDias(base, dias[0]);
  const piso = somarDias(base, PISO_DIAS);
  return candidato > piso ? candidato : piso;
}

/**
 * Mapa parcela → vencimento sugerido.
 * `ancoraParcela1` é a data EFETIVA da parcela 1 (o que o humano decidiu). Quando
 * informada, as demais seguem o intervalo comercial a partir dela.
 */
export function sugerirVencimentosDoPedido(
  faturadoEm: string | null | undefined,
  condicaoSolicitada: string | null | undefined,
  totalParcelas: number | null | undefined,
  ancoraParcela1?: string | null,
): Record<number, string> | null {
  const dias = extrairDiasCondicao(condicaoSolicitada);
  if (!dias) return null;
  if (!totalParcelas || dias.length !== totalParcelas) return null;

  const ancoraValida =
    ancoraParcela1 && /^\d{4}-\d{2}-\d{2}$/.test(ancoraParcela1) ? ancoraParcela1 : null;
  const p1 = ancoraValida ?? vencimentoParcelaUm(faturadoEm, condicaoSolicitada);
  if (!p1) return null;

  const out: Record<number, string> = {};
  for (let i = 0; i < dias.length; i++) out[i + 1] = somarDias(p1, dias[i] - dias[0]);
  return out;
}

export function sugerirVencimentoBoleto(
  faturadoEm: string | null | undefined,
  condicaoSolicitada: string | null | undefined,
  numeroParcela: number | null | undefined,
  totalParcelas: number | null | undefined,
  ancoraParcela1?: string | null,
): string | null {
  const mapa = sugerirVencimentosDoPedido(
    faturadoEm,
    condicaoSolicitada,
    totalParcelas,
    ancoraParcela1,
  );
  if (!mapa) return null;
  return mapa[numeroParcela ?? 1] ?? null;
}
