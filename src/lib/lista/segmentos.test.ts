import { describe, expect, it } from "vitest";
import { recortarSegmentos } from "./segmentos";

describe("páginas atravessando blocos ordenados", () => {
  it("preserva pré-aprovadas primeiro quando a página atravessa a divisão", () => {
    expect(recortarSegmentos([{ chave: "pre", total: 23 }, { chave: "outras", total: 490 }], 2, 20)).toEqual([
      { chave: "pre", inicio: 20, quantidade: 3 }, { chave: "outras", inicio: 0, quantidade: 17 },
    ]);
  });
  it("preserva quente, morno, frio e não cobrar antes das temperaturas restantes", () => {
    expect(recortarSegmentos([
      { chave: "quente", total: 1 }, { chave: "morno", total: 1 }, { chave: "frio", total: 1 },
      { chave: "nao_cobrar", total: 0 }, { chave: "restantes", total: 406 },
    ], 1, 20)).toEqual([
      { chave: "quente", inicio: 0, quantidade: 1 }, { chave: "morno", inicio: 0, quantidade: 1 },
      { chave: "frio", inicio: 0, quantidade: 1 }, { chave: "restantes", inicio: 0, quantidade: 17 },
    ]);
  });
  it("não recomeça o último bloco na segunda página", () => {
    expect(recortarSegmentos([{ chave: "primeiro", total: 3 }, { chave: "ultimo", total: 406 }], 2, 20))
      .toEqual([{ chave: "ultimo", inicio: 17, quantidade: 20 }]);
  });
});