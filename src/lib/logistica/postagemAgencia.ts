/**
 * MESA-SP-AGENCIA-BIPE-VENCE (02/11/2026, Flávio): pedido marcado "postagem na agência"
 * (evento `mesa_postagem_agencia`) que tem etiqueta SNCF viva com código diferente do
 * bipado → o bipado vence: a etiqueta SNCF é cancelada nos Correios antes do despacho.
 * Sem agência, nada muda: a trava do banco recusa o bipe divergente.
 */
export function normalizarBipe(v: string | null | undefined): string {
  return (v ?? "").replace(/\s/g, "").toUpperCase();
}

export function etiquetaSncfASubstituir(args: {
  temAgencia: boolean;
  codigoSncf: string | null | undefined;
  codigoBipado: string | null | undefined;
}): string | null {
  const sncf = normalizarBipe(args.codigoSncf);
  const bipado = normalizarBipe(args.codigoBipado);
  if (!args.temAgencia || !sncf || !bipado || sncf === bipado) return null;
  return sncf;
}

export function motivoSubstituicaoAgencia(bipado: string, sncf: string): string {
  return `Postado na agência — código bipado ${normalizarBipe(bipado)} substitui a etiqueta SNCF ${sncf}`;
}

/** Códigos que ficam no campo depois do lote: só os que NÃO despacharam. */
export function codigosAposLote(
  codigos: Record<string, string>,
  itens: { pedido_id: string; ok: boolean }[],
): Record<string, string> {
  const ok = new Set(itens.filter((i) => i.ok).map((i) => i.pedido_id));
  return Object.fromEntries(Object.entries(codigos).filter(([id]) => !ok.has(id)));
}
