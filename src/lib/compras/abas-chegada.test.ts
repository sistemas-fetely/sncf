import { describe, expect, it } from "vitest";
import { selecaoChegada } from "./abas-chegada";

describe("links da Chegada de Mercadoria", () => {
  it.each(["importar-pi", "cadastro-pi"])("preserva o link antigo %s no grupo PI", (sub) => {
    expect(selecaoChegada(new URLSearchParams({ aba: sub }))).toMatchObject({ aba: "importacao-pi", pi: sub });
  });
  it.each(["de-para", "rateio-nf"])("preserva o link antigo %s em Ferramentas", (sub) => {
    expect(selecaoChegada(new URLSearchParams({ aba: sub }))).toMatchObject({ aba: "ferramentas", ferramenta: sub });
  });
  it("mantém o link Documentos e as seleções internas independentes", () => {
    expect(selecaoChegada(new URLSearchParams("aba=nfs-sem-pedido&aba_pi=cadastro-pi&aba_ferramentas=rateio-nf"))).toEqual({ aba: "nfs-sem-pedido", pi: "cadastro-pi", ferramenta: "rateio-nf" });
  });
});