import { describe, expect, it } from "vitest";
import { enriquecerReferencias, type MpLiberacao } from "../../../supabase/functions/_shared/financeiro/mp/release";

const lib = (id: string, valor: number, tok: string): MpLiberacao => ({
  data_liberacao: "2026-06-02", id_operacao: id, descricao: "Pagamento", valor_liquido: valor, meio_pagamento: "Pix",
  codigo_referencia: tok, saldo_apos: 0, descricao_mp: "Pagamento", conta_destino: "", origem: "mp_reserve_release",
});

describe("Enriquecimento de liberações antigas", () => {
  const plano = enriquecerReferencias(
    [lib("1", 10, "tokA"), lib("2", 20, "tokB"), lib("3", 30, "tokC"), lib("4", 40, ""), lib("9", 90, "tokZ")],
    [
      { id: "m1", id_transacao_banco: "1", valor: 10, referencia_pedido: null },
      { id: "m2", id_transacao_banco: "2", valor: 20, referencia_pedido: "tokB" },
      { id: "m3", id_transacao_banco: "3", valor: 30, referencia_pedido: "outro" },
      { id: "m4", id_transacao_banco: "4", valor: 40, referencia_pedido: null },
    ],
  );
  it("só preenche token vazio", () => expect(plano.atualizar).toEqual([{ id: "m1", referencia_pedido: "tokA" }]));
  it("token diferente do gravado é conflito, não sobrescreve", () => expect(plano.conflitos.map((c) => c.id)).toEqual(["m3"]));
  it("linha sem lançamento vira sem_par (nunca inserção)", () => expect(plano.sem_par.map((s) => s.id_operacao)).toEqual(["9"]));
  it("mesmo id com valor diferente não casa", () => {
    const p = enriquecerReferencias([lib("1", 11, "t")], [{ id: "m1", id_transacao_banco: "1", valor: 10, referencia_pedido: null }]);
    expect(p.casados).toBe(0);
  });
});
