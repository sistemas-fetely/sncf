import { describe, it, expect } from "vitest";
import { lerLista, escreverLista } from "./codecUrl";

describe("lista na URL", () => {
  it("vazia sai da URL", () => expect(escreverLista([])).toBe(""));
  it("ida e volta mantém os itens", () => expect(lerLista(escreverLista(["ativo", "__sem__"]))).toEqual(["ativo", "__sem__"]));
  it("texto vazio vira lista vazia", () => expect(lerLista("")).toEqual([]));
});
