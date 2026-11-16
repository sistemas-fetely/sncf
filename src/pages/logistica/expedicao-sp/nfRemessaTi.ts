/** Apenas estado do botão; elegibilidade fiscal vem exclusivamente do banco. */
export function podeGerarRemessaTi(status: string | null | undefined, autorizada: boolean): boolean {
  return !autorizada && (status == null || status === "erro");
}