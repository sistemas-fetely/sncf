import { describe, expect, it } from "vitest";
import { alternarVisiveis, estadoSelecaoVisivel, opcoesVisiveis, resumoSelecao } from "./multiSelectFilter";

const opcoes = ["Vela", "Prato", "Decoração", "Copo"].map((rotulo) => ({ valor: rotulo, rotulo, contagem: 1 }));

describe("seleção múltipla visível", () => {
  it("respeita busca sem acento e mantém seleção fora da busca", () => {
    const visiveis = opcoesVisiveis(opcoes, "DECORACAO");
    expect(visiveis.map((opcao) => opcao.valor)).toEqual(["Decoração"]);
    expect(alternarVisiveis(visiveis, ["Vela"])).toEqual(["Vela", "Decoração"]);
    expect(alternarVisiveis(visiveis, ["Vela", "Decoração"])).toEqual(["Vela"]);
  });
  it("distingue nenhum, alguns e todos visíveis", () => {
    expect(estadoSelecaoVisivel(opcoes, [])).toBe(false);
    expect(estadoSelecaoVisivel(opcoes, ["Vela"])).toBe("indeterminate");
    expect(estadoSelecaoVisivel(opcoes, opcoes.map((opcao) => opcao.valor))).toBe(true);
    expect(estadoSelecaoVisivel([], ["Vela"])).toBe(false);
  });
  it("selecionar todas mantém seleção explícita sem normalizar", () => {
    expect(alternarVisiveis(opcoes, [])).toEqual(["Vela", "Prato", "Decoração", "Copo"]);
    expect(alternarVisiveis(opcoes, ["Vela", "Prato", "Decoração", "Copo"])).toEqual([]);
  });
  it("classifica vazio, total, único, maioria e metade para o resumo", () => {
    expect(resumoSelecao(opcoes, [])).toEqual({ tipo: "vazio" });
    expect(resumoSelecao(opcoes, ["Vela", "Prato", "Decoração", "Copo"])).toEqual({ tipo: "todas", quantidade: 4 });
    expect(resumoSelecao(opcoes, ["Vela"])).toEqual({ tipo: "unica", nome: "Vela" });
    expect(resumoSelecao(opcoes, ["Vela", "Prato", "Copo"])).toEqual({ tipo: "exceto", quantidade: 1 });
    expect(resumoSelecao(opcoes, ["Vela", "Prato"])).toEqual({ tipo: "quantidade", quantidade: 2 });
  });
});