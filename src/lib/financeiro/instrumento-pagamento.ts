/**
 * Instrumento de pagamento — helpers compartilhados.
 *
 * Doutrina: um BR Code PIX (EMV) NÃO é URL. Ele é texto opaco que sempre
 * começa com "000201". Nenhuma trava de "link malformado" ou "link vencido"
 * se aplica a ele: BR Code estático vale enquanto a chave PIX existir.
 */
export function ehBrCodePix(valor?: string | null): boolean {
  return (valor ?? "").trim().startsWith("000201");
}
