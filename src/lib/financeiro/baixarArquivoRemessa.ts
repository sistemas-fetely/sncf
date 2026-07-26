/**
 * Faz download do conteúdo textual de uma remessa Safra (CNAB) como arquivo.
 * FAIL-LOUD: lança se conteudo for null/vazio — o chamador exibe o toast.
 */
export function baixarArquivoRemessa(conteudo: string | null, arquivoNome: string): void {
  if (!conteudo) {
    throw new Error("Arquivo não disponível — remessa anterior ao histórico de conteúdo persistido.");
  }
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivoNome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
