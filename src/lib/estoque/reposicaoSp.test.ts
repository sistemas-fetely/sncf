import { describe, expect, it } from "vitest";
import { escolherFrete, lerCargaReposicao, linhasReposicao, totaisReposicao, type ReposicaoSp } from "./reposicaoSp";
const linhas = [
  { sku: "A", ritmo: "urgente", peso_g: 100, qtd_sugerida: 3 },
  { sku: "B", ritmo: "carga", peso_g: null, qtd_sugerida: 2 },
  { sku: "C", ritmo: null, peso_g: 200, qtd_sugerida: 0 },
] as ReposicaoSp[];
describe("Reposição SP v2", () => {
  it("urgente inclui apenas urgente", () => expect(linhasReposicao(linhas, "urgente").map(l => l.sku)).toEqual(["A"]));
  it("carga inclui urgente e carga", () => expect(linhasReposicao(linhas, "carga").map(l => l.sku)).toEqual(["A", "B"]));
  it("soma kits e peso do cadastro sem inventar peso ausente", () => expect(totaisReposicao([{ sku: "A", nome: "A", quantidade: 3 }, { sku: "B", nome: "B", quantidade: 2 }], linhas)).toEqual({ skus: 2, kits: 5, pesoKg: 0.3, semPeso: 1 }));
  it("pré-carga mantém quantidades humanas", () => expect(lerCargaReposicao({ reposicaoSp: { aba: "carga", itens: [{ sku: "A", nome: "A", quantidade: 7 }] } })?.itens[0].quantidade).toBe(7));
  it("recusa carga inválida", () => expect(lerCargaReposicao({ reposicaoSp: { aba: "urgente", itens: [{ sku: "A", nome: "A", quantidade: -1 }] } })).toBeNull());
  const fretes = [{ chave: "PAC", nome: "PAC", transportadoraId: "C", valor: 20, prazo: 6 }, { chave: "SEDEX", nome: "SEDEX", transportadoraId: "C", valor: 40, prazo: 2 }];
  it("urgente pré-seleciona mais rápido", () => expect(escolherFrete(fretes, "urgente")?.chave).toBe("SEDEX"));
  it("carga pré-seleciona mais barato", () => expect(escolherFrete(fretes, "carga")?.chave).toBe("PAC"));
  it("prazo ausente não vence urgente", () => expect(escolherFrete([...fretes, { chave: "X", nome: "X", transportadoraId: "X", valor: 1, prazo: null }], "urgente")?.chave).toBe("SEDEX"));
});