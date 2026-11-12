import { describe, expect, it } from "vitest";
import { abaNfRetornoPermitida, destinoFunilNfRetorno } from "./nfRetornoNavegacao";

describe("navegação da NF de retorno", () => {
  it("recusa a aba fiscal sem permissão sem alterar as outras quatro", () => {
    expect(abaNfRetornoPermitida("nf-retorno", false, false)).toBe("funil");
    expect(abaNfRetornoPermitida("nf-retorno", true, false)).toBe("nf-retorno");
    expect(abaNfRetornoPermitida("nf-retorno", false, true)).toBe("nf-retorno");
    for (const aba of ["funil", "correcoes", "quarentena", "reembolso"]) {
      expect(abaNfRetornoPermitida(aba, false, false)).toBe(aba);
    }
  });
  it("abre o funil junto com a busca, detalhe e finalizados", () => {
    const url = new URL(destinoFunilNfRetorno("dev-id", "DEV-2326"), "https://example.test");
    expect(url.pathname).toBe("/devolucoes");
    expect(Object.fromEntries(url.searchParams)).toEqual({ aba: "funil", q: "DEV-2326", detalhe: "dev-id", fin: "true" });
  });
});
