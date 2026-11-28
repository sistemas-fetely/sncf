import { describe, it, expect } from "vitest";
import { agruparPendencias, canaisDaSuperficie, rotaDaPendencia, type LinhaPendencia } from "./conciliacaoSuperficie";
import { contadoresConciliacao } from "./abasConciliacao";

const l = (regra: string, cod: string): LinhaPendencia => ({ linha_id: regra + cod, regra, regra_nome: regra, cod_cadastro: cod, sku: cod, nome_comercial: null, o_que_fazer: null, rota_resolver: null, campo_matriz: null, valor_matriz: null });

describe("superfície da conciliação", () => {
  it("SNCF sai dos canais de Divergências", () => {
    const dim = [{ slug: "SNCF" }, { slug: "Bling" }, { slug: "Mercado Livre" }];
    const regras = [
      { onde_resolver: "SNCF", superficie: "pendencia_cadastro" },
      { onde_resolver: "Bling", superficie: "divergencias" },
      { onde_resolver: "Bling", superficie: "destinos" },
      { onde_resolver: "Mercado Livre", superficie: "divergencias" },
    ];
    expect(canaisDaSuperficie(dim, regras).map(d => d.slug)).toEqual(["Bling", "Mercado Livre"]);
  });
  it("agrupa pendências por regra com contador, maior primeiro", () => {
    const g = agruparPendencias([l("sncf_ncm_diverge_nf", "1"), l("sncf_fisico_provisorio", "1"), l("sncf_fisico_provisorio", "2")]);
    expect(g.map(x => [x.regra, x.linhas.length])).toEqual([["sncf_fisico_provisorio", 2], ["sncf_ncm_diverge_nf", 1]]);
  });
  it("rota preenche o código e some sem código", () => {
    expect(rotaDaPendencia("/vendas/produto/ficha/{cod_cadastro}", "01000")).toBe("/vendas/produto/ficha/01000");
    expect(rotaDaPendencia("/vendas/produto/ficha/{cod_cadastro}", null)).toBeNull();
    expect(rotaDaPendencia(null, "01000")).toBeNull();
  });
  it("Ajustes soma mudanças e pendências de cadastro, separadas", () => {
    const c = contadoresConciliacao(null, 12, 1583, 190);
    expect(c.ajustes).toBe(202);
    expect(c.ajustesMudancas).toBe(12);
    expect(c.ajustesPendencias).toBe(190);
    expect(c.saida).toBe(1583);
  });
});
