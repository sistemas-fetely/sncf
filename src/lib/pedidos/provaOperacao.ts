/** Só o veredito de expedição do banco autoriza mostrar prova na operação. */
export function mostrarProvaOperacao(liberacao: { liberado: boolean } | null | undefined): boolean {
  return liberacao?.liberado === false;
}