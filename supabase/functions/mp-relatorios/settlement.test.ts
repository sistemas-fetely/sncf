import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { linhasVendaMarketplace, normalizarMpSettlement } from "../_shared/financeiro/mp/settlement.ts";
import { lerCsvMp } from "../_shared/financeiro/mp/release.ts";

const CAB = "COUNTRY_ISSUER;EXTERNAL_REFERENCE;SOURCE_ID;USER_ID;PAYMENT_METHOD_TYPE;PAYMENT_METHOD;SITE;TRANSACTION_TYPE;TRANSACTION_AMOUNT;TRANSACTION_CURRENCY;SELLER_AMOUNT;TRANSACTION_DATE;TRANSACTION_DATE_SHORT;FEE_AMOUNT;SETTLEMENT_NET_AMOUNT;SETTLEMENT_CURRENCY;SETTLEMENT_DATE;SETTLEMENT_DATE_SHORT;REAL_AMOUNT;COUPON_AMOUNT;METADATA;MKP_FEE_AMOUNT;FINANCING_FEE_AMOUNT;SHIPPING_FEE_AMOUNT;TAXES_AMOUNT;INSTALLMENTS;TAX_DETAIL;POS_ID;STORE_ID;STORE_NAME;EXTERNAL_POS_ID;POS_NAME;EXTERNAL_STORE_ID;ORDER_ID;SHIPPING_ID;SHIPMENT_MODE;PACK_ID;TAXES_DISAGGREGATED;POI_ID;POI_WALLET_NAME;POI_BANK_NAME;DESCRIPTION;MONEY_RELEASE_DATE;MONEY_RELEASE_DATE_SHORT;INSTALLMENT_NUMBER;INSTALLMENT_NET_AMOUNT;CARD_INITIAL_NUMBER;OPERATION_TAGS;BUSINESS_UNIT;SUB_UNIT;SEGMENT_DETAIL;PRODUCT_SKU;SALE_DETAIL;TRANSACTION_INTENT_ID;FRANCHISE;LAST_FOUR_DIGITS;ORDER_MP;INVOICING_PERIOD;ISSUER_NAME;PAY_BANK_TRANSFER_ID;IS_RELEASED;TIP_AMOUNT;PURCHASE_ID;SHIPPING_ORDER_ID;TOTAL_COUPON_AMOUNT;APPLICATION_ID;AUTHORIZATION_CODE;CARD_ENTRY_MODE;AUTHENTICATED_PAYER";
const LINHA = 'BRA;"2000019462637558";187850157613;3747256027;credit_card;master;MLB;SETTLEMENT;19.90;BRL;0.00;2026-11-10T18:58:08.000-03:00;2026-11-10;-10.53;9.37;BRL;2026-11-10T18:58:26.000-03:00;2026-11-10;9.37;0.00;"[{}]";-3.32;-0.06;-7.15;0.00;1;;;;;;;;2000019462637558;48485691471;;2000015974676337;"[]";;;;;2026-11-24T14:12:19.000-03:00;2026-11-24;;;53469610;;Mercado Libre;;Marketplace;PRTSBRPQ.FG.20/01504;"""Prato Sobremesa Fungi Royale Verde - 15cm - 6un - Fetély Verde""";000hreu4xx;master;0084;;2026-11;C6 BANK;;false;0.00;2000015974676335;;0.00;4152119344514024;176335;;registered';
const rowsCsv = () => lerCsvMp(`${CAB}\n${LINHA}\n`);

Deno.test("CSV inglês: venda MP-Meli 10/11 é lida", () => {
  const t = normalizarMpSettlement(rowsCsv());
  assertEquals(t.length, 1);
  assertEquals(t[0].id_transacao_mp, "187850157613");
  assertEquals(t[0].valor_bruto, 19.9);
  assertEquals(t[0].tarifa, 10.53);
  assertEquals(t[0].valor_liquido, 9.37);
  assertEquals(t[0].data_liberacao, "2026-11-24");
  assertEquals(t[0].codigo_referencia, "2000019462637558");
});

Deno.test("XLSX português da MP-Shopify: resultado igual ao leitor anterior", () => {
  const rows = JSON.parse(Deno.readTextFileSync(new URL("./fixture_settlement_shopify_xlsx.json", import.meta.url)));
  const esperado = JSON.parse(Deno.readTextFileSync(new URL("./fixture_settlement_shopify_esperado.json", import.meta.url)));
  assertEquals(esperado.length, 6);
  assertEquals(normalizarMpSettlement(rows), esperado);
});

Deno.test("colunas desconhecidas com dados: erro claro", () => {
  assertThrows(() => normalizarMpSettlement([["FOO", "BAR"], ["1", "2"]]), Error, "Arquivo de vendas com colunas não reconhecidas: FOO, BAR");
  assertThrows(() => linhasVendaMarketplace([["FOO"], ["1"]]), Error, "colunas não reconhecidas");
});

Deno.test("só cabeçalho continua sem movimento", () => {
  assertEquals(normalizarMpSettlement([["FOO", "BAR"]]), []);
  assertEquals(linhasVendaMarketplace(lerCsvMp(`${CAB}\n`)), []);
});

Deno.test("payload da RPC marketplace", () => {
  const [l] = linhasVendaMarketplace(rowsCsv());
  assertEquals(l.source_id, "187850157613");
  assertEquals(l.tipo_transacao, "SETTLEMENT");
  assertEquals(l.order_id, "2000019462637558");
  assertEquals(l.pack_id, "2000015974676337");
  assertEquals(l.valor_bruto, "19.90");
  assertEquals(l.tarifa_total, "-10.53");
  assertEquals(l.comissao, "-3.32");
  assertEquals(l.taxa_financiamento, "-0.06");
  assertEquals(l.frete, "-7.15");
  assertEquals(l.valor_liquido, "9.37");
  assertEquals(l.data_liberacao_prevista, "2026-11-24T14:12:19.000-03:00");
  assertEquals(l.liberado, "false");
  assertEquals(l.shipment_mode, undefined);
  assertEquals((l.raw as Record<string, string>).SITE, "MLB");
});
