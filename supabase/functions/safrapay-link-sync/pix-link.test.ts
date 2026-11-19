import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { provaPixLink, alertaPreAutorizacao, estadoAguardandoLink } from "./pix-link.ts";
Deno.test("VD-0145 usa transactionId da charge paga, não NSU interno", () => {
  assertEquals(provaPixLink([{ chargeStatus: 2, transactions: [{ transactionId: "ignorar" }] }, { chargeStatus: 1, nsu: "000000170", transactions: [{ transactionId: "e625891c-..." }] }]), "e625891c-...");
});
Deno.test("endToEndId tem prioridade", () => assertEquals(provaPixLink([{ chargeStatus: 1, nsu: "170", transactions: [{ endToEndId: "E123", transactionId: "tx" }] }]), "E123"));
Deno.test("NSU é o último recurso", () => assertEquals(provaPixLink([{ chargeStatus: 1, nsu: "000000170", transactions: [] }]), "000000170"));
Deno.test("charge não paga não fornece prova", () => assertEquals(provaPixLink([{ chargeStatus: 2, nsu: "170" }]), null));
Deno.test("status 2 do link PIX não é pré-autorização", () => { assertEquals(alertaPreAutorizacao(true, true), false); assertEquals(alertaPreAutorizacao(false, true), true); });
Deno.test("espera PIX limpa erro antigo, cartão preserva", () => { assertEquals(estadoAguardandoLink(true), { erro: null }); assertEquals(estadoAguardandoLink(false), {}); });