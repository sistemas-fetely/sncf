export function divergeDaSugestao(sugerido: string | null, escolhido: string): boolean {
  return !!sugerido && sugerido !== escolhido;
}

export function podeTrocarCd(status: string | null, atual: string | null): boolean {
  return status === "pendente" && !!atual;
}

export function trocaCdValida(atual: string | null, escolhido: string, motivo: string): boolean {
  return !!escolhido && escolhido !== atual && motivo.trim().length > 0;
}