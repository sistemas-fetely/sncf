import { describe, expect, it } from "vitest";
import { redirecionamentoChegada, selecaoChegada } from "./abas-chegada";

describe("links da Chegada de Mercadoria", () => {
  it("preserva o link antigo importar-pi no grupo PI", () => {
    expect(selecaoChegada(new URLSearchParams({ aba: "importar-pi" }))).toMatchObject({ aba: "importacao-pi", pi: "importar-pi" });
  });
  it.each(["de-para", "rateio-nf"])("preserva o link antigo %s em Ferramentas", (sub) => {
    expect(selecaoChegada(new URLSearchParams({ aba: sub }))).toMatchObject({ aba: "ferramentas", ferramenta: sub });
  });
  it("mantém o link Documentos e as seleções internas independentes", () => {
    expect(selecaoChegada(new URLSearchParams("aba=nfs-sem-pedido&aba_pi=importar-pi&aba_ferramentas=rateio-nf"))).toEqual({ aba: "nfs-sem-pedido", pi: "importar-pi", ferramenta: "rateio-nf" });
  });
  it.each(["aba=cadastro-pi", "aba=importacao-pi&aba_pi=cadastro-pi"])("nascimento antigo (%s) vai para Conciliação › Novos", (q) => {
    expect(redirecionamentoChegada(new URLSearchParams(q))).toBe("/vendas/produto/conciliacao?aba=novos");
  });
  it("demais links não redirecionam", () => {
    expect(redirecionamentoChegada(new URLSearchParams("aba=importacao-pi&aba_pi=importar-pi"))).toBeNull();
  });
});
