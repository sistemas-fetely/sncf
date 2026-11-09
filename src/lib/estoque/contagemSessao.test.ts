import { describe, it, expect } from "vitest";
import {
  sessaoVazia, somarLeitura, definirQtd, removerItem, importarItens, preenchidos,
  resumoSessao, naoContados, itensRegistro, sugerirProdutos, lerRascunho,
} from "./contagemSessao";

describe("contagemSessao", () => {
  it("ler soma e sobe o item ao topo", () => {
    let s = somarLeitura(sessaoVazia(), "A", 1);
    s = somarLeitura(s, "B", 1);
    s = somarLeitura(s, "A", 2);
    expect(s.ordem).toEqual(["A", "B"]);
    expect(s.qtd.A).toBe("3");
  });

  it("desfazer tira o item ao chegar a 0 (sem deixar '0')", () => {
    let s = somarLeitura(sessaoVazia(), "A", 2);
    s = somarLeitura(s, "A", -1);
    expect(s.qtd.A).toBe("1");
    s = somarLeitura(s, "A", -1);
    expect("A" in s.qtd).toBe(false);
    expect(s.ordem).toEqual([]);
  });

  it("remover apaga a chave", () => {
    const s = removerItem(somarLeitura(sessaoVazia(), "A", 5), "A");
    expect(s).toEqual(sessaoVazia());
  });

  it("digitar 0 é contagem válida de zero", () => {
    const s = definirQtd(sessaoVazia(), "A", "0");
    expect(preenchidos(s)).toEqual([["A", 0]]);
    expect(resumoSessao(s, new Map([["A", 3]]))).toEqual({ itens: 1, pecas: 0, sobras: 0, faltas: 1 });
  });

  it("importar substituir zera a sessão; somar acumula", () => {
    const s = somarLeitura(sessaoVazia(), "A", 1);
    expect(importarItens(s, [{ sku: "B", qtd: 2 }], "substituir").qtd).toEqual({ B: "2" });
    expect(importarItens(s, [{ sku: "A", qtd: 2 }], "somar").qtd).toEqual({ A: "3" });
  });

  it("total inclui não contados com 0; parcial só os contados", () => {
    const s = somarLeitura(sessaoVazia(), "A", 4);
    const nc = naoContados([{ sku: "A" }, { sku: "B" }, { sku: "C" }], s).map((l) => l.sku);
    expect(nc).toEqual(["B", "C"]);
    expect(itensRegistro(s, nc, "parcial")).toEqual([{ sku: "A", qtd: 4, condicao: "sadio" }]);
    expect(itensRegistro(s, nc, "total").map((i) => [i.sku, i.qtd])).toEqual([["A", 4], ["B", 0], ["C", 0]]);
  });

  it("sugestões só com letras, até 8, sem acento", () => {
    const cat = Array.from({ length: 12 }, (_, i) => ({ sku: `S${i}`, cod_cadastro: `0${i}`, nome_comercial: "Vela Número", cor_nome: "Dourada", colecao: null }));
    expect(sugerirProdutos(cat, "01355")).toEqual([]);
    expect(sugerirProdutos(cat, "numero dour")).toHaveLength(8);
  });

  it("rascunho inválido vira sessão vazia", () => {
    expect(lerRascunho("{x")).toEqual(sessaoVazia());
    expect(lerRascunho(JSON.stringify({ ordem: ["A"], qtd: { A: "2" } }))).toEqual({ ordem: ["A"], qtd: { A: "2" } });
  });
});
