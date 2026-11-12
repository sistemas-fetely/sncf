/**
 * CABECALHO-CONFIRMA-O-LEITOR (03/11/2026): uma planilha só vai para um leitor
 * quando o cabeçalho dela confirma aquele leitor. Antes, tudo que não casava
 * caía em "safra_lancamentos" e morria lá (account_statement do Mercado Pago,
 * os próprios relatórios do SNCF). Agora:
 *  - assinatura/título conhecido → aquele leitor;
 *  - planilha do próprio SNCF → "relatorio_sncf" (recusada antes de importar);
 *  - nada confirma → null ("formato não suportado → guardar sem ler").
 */
import { detectarAssinaturaSafraXlsx, type AssinaturaSafraXlsx } from "./xlsx-safra-assinatura";
import { temTitulo, textoPrimeirasLinhas } from "./xlsx-titulo";
import { ehSafraPagamentos } from "./xlsx-safra-pagamentos-parser";
import { acharCabecalhoSafraLancamentos } from "./xlsx-safra-lancamentos-parser";

export type FonteXlsx =
  | AssinaturaSafraXlsx
  | "safra_instrucoes_2via"
  | "safra_francesinha"
  | "mp_settlement"
  | "mp_release"
  | "mp_withdraw"
  | "safra_lancamentos"
  | "safra_pagamentos";

export type ClassificacaoXlsx = FonteXlsx | "relatorio_sncf" | null;

/** Planilhas geradas pelo SNCF (estoque contábil, resumo mensal CFO). */
export function ehRelatorioSncf(rows: unknown[][]): boolean {
  const cab = textoPrimeirasLinhas(rows, 12);
  if (/(^|\/\/ )resumo mensal/.test(cab)) return true;
  if (/fonte: fechamentos contabeis do sncf/.test(cab)) return true;
  return /(^|\/\/ )sku \| produto \| centro \|/.test(cab);
}

export function classificarXlsx(rows: unknown[][], nomeAba?: string): ClassificacaoXlsx {
  if (nomeAba && ehSafraPagamentos(nomeAba, rows)) return "safra_pagamentos";
  const assinatura = detectarAssinaturaSafraXlsx(rows);
  if (assinatura) return assinatura;
  if (temTitulo(rows, /recebimentos\s*-\s*instrucoes/)) return "safra_instrucoes_2via";
  if (temTitulo(rows, /francesinha/)) return "safra_francesinha";
  if (ehRelatorioSncf(rows)) return "relatorio_sncf";

  const cab = textoPrimeirasLinhas(rows, 5);
  // Settlement v2: exige a coluna de id da transação que o leitor usa. O relatório
  // "collection" do MP também tem "data de liberação do dinheiro", mas outras colunas.
  if (/data de liberacao do dinheiro/.test(cab) && /id da transacao no mercado pago/.test(cab)) return "mp_settlement";
  if (/valor liquido creditado/.test(cab) && /saldo/.test(cab)) return "mp_release";
  if (/withdraw_id|numero da retirada/.test(cab)) return "mp_withdraw";
  if (acharCabecalhoSafraLancamentos(rows) >= 0) return "safra_lancamentos";
  return null;
}
