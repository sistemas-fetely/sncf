/** Nome de arquivo seguro: sem acento, espaços → "_", sem caracteres especiais. */
export function nomeSeguro(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "") || "Sem_nome";
}

export const nomeArquivoExtrato = (competencia: string, representante: string) => `Extrato_${competencia}_${nomeSeguro(representante)}.pdf`;
export const nomeZipExtratos = (competencia: string) => `Extratos_${competencia}.zip`;

export interface BlocoCorte { top: number; bottom: number; grudaProximo?: boolean }

/**
 * Pontos de corte entre páginas: nunca corta um bloco ao meio e não deixa um
 * bloco "grudado" (cabeçalho de mês, título) sozinho no fim da página.
 */
export function pontosDeCorte(total: number, pagina: number, blocos: BlocoCorte[]): number[] {
  const ord = [...blocos].sort((a, b) => a.top - b.top);
  const cortes: number[] = [];
  let inicio = 0;
  while (total - inicio > pagina) {
    const limite = inicio + pagina;
    let corte = limite;
    for (const b of ord) if (b.top > inicio && b.top < corte && b.bottom > corte) corte = b.top;
    for (let mudou = true; mudou;) {
      mudou = false;
      for (let i = 0; i < ord.length; i++) {
        const b = ord[i];
        if (!b.grudaProximo || b.top <= inicio || b.bottom > corte) continue;
        const prox = ord.slice(i + 1).find(o => o.top >= b.bottom - 1);
        if (!prox || prox.top >= corte - 1) { corte = b.top; mudou = true; }
      }
    }
    if (corte - inicio < pagina * 0.3) corte = limite;
    cortes.push(corte);
    inicio = corte;
  }
  return cortes;
}
