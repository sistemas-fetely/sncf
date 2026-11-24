import { describe, expect, it } from "vitest";
import {
  fonteLiberacao,
  fontePedido,
  fonteRisco,
  fonteSituacaoFinanceira,
  rotuloFontePedido,
} from "./fontePedido";

describe("fontePedido — lista lê foto, detalhe lê view viva", () => {
  it("risco: padrão é a view viva, foto=true é a foto", () => {
    expect(fonteRisco()).toBe("vw_pedido_risco");
    expect(fonteRisco(false)).toBe("vw_pedido_risco");
    expect(fonteRisco(true)).toBe("vw_foto_pedido_risco");
  });

  it("liberação: padrão é a view viva, foto=true é a foto", () => {
    expect(fonteLiberacao()).toBe("vw_pedido_liberacao_expedicao");
    expect(fonteLiberacao(false)).toBe("vw_pedido_liberacao_expedicao");
    expect(fonteLiberacao(true)).toBe("vw_foto_pedido_liberacao");
  });

  it("situação financeira: padrão é a view viva, foto=true é a foto", () => {
    expect(fonteSituacaoFinanceira()).toBe("vw_pedido_situacao_financeira");
    expect(fonteSituacaoFinanceira(false)).toBe("vw_pedido_situacao_financeira");
    expect(fonteSituacaoFinanceira(true)).toBe(
      "vw_foto_pedido_situacao_financeira",
    );
  });

  it("fontePedido resolve a mesma relação das funções nomeadas", () => {
    expect(fontePedido("risco", true)).toBe(fonteRisco(true));
    expect(fontePedido("liberacao")).toBe(fonteLiberacao());
    expect(fontePedido("situacaoFinanceira", true)).toBe(
      fonteSituacaoFinanceira(true),
    );
  });

  it("rótulo da fonte separa as duas cache keys", () => {
    expect(rotuloFontePedido()).toBe("vivo");
    expect(rotuloFontePedido(true)).toBe("foto");
    expect(rotuloFontePedido()).not.toBe(rotuloFontePedido(true));
  });
});
