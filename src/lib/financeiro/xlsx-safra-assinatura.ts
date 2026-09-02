/**
 * ASSINATURA-MANDA-NO-NOME (01/09/2026)
 *
 * A fonte era adivinhada pelo nome do arquivo e errava: "Agenda de Vendas.xlsx",
 * "Recebiveis de Vendas.xlsx" e "Lançamentos e Devoluções.xlsx" caíam todos no
 * parser de extrato e morriam em "Cabeçalho Safra Lançamentos não reconhecido".
 *
 * Todo relatório Safra escreve o próprio TÍTULO dentro do arquivo. Lemos as
 * primeiras linhas, normalizamos acento e caixa, e o título decide. Esta
 * detecção tem PRECEDÊNCIA sobre qualquer palpite pelo nome do arquivo.
 */

import { temTitulo } from "./xlsx-titulo";

export type AssinaturaSafraXlsx =
  | "safra_pix_lancamentos"
  | "safrapay_agenda_vendas"
  | "safrapay_recebiveis";

export function detectarAssinaturaSafraXlsx(rows: unknown[][]): AssinaturaSafraXlsx | null {
  if (temTitulo(rows, /lancamentos e devolucoes/)) return "safra_pix_lancamentos";
  // "Recebiveis de Vendas" é a LIQUIDAÇÃO (repasse) — vem antes de qualquer
  // teste de "agenda de vendas", que é a AUTORIZAÇÃO.
  if (temTitulo(rows, /recebiveis de vendas/)) return "safrapay_recebiveis";
  if (temTitulo(rows, /agenda de vendas/)) return "safrapay_agenda_vendas";
  return null;
}

