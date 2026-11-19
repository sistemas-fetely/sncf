import { describe, expect, it } from "vitest";
import { BUSCA_MESA_DEBOUNCE_MS, ordenarFacetasMesa, parametrosMesaProduto } from "./mesaProdutoRpc";

describe("ordenação dos filtros da Mesa", () => {
  const opcoes = [
    { valor: "Fine Pure", rotulo: "Fine Pure", contagem: 100 },
    { valor: "Le Moment", rotulo: "Le Moment", contagem: 27 },
    { valor: "Esprit", rotulo: "Esprit d'Halloween", contagem: 18 },
  ];
  it("fixa marcadas no topo em ordem alfabética entre si", () => {
    expect(ordenarFacetasMesa(opcoes, ["Le Moment", "Fine Pure"]).map(o => o.valor)).toEqual(["Fine Pure", "Le Moment", "Esprit"]);
  });
  it("ordena demais alfabeticamente sem priorizar contagens", () => {
    expect(ordenarFacetasMesa(opcoes, []).map(o => o.valor)).toEqual(["Esprit", "Fine Pure", "Le Moment"]);
  });
  it("compara acentos e caixa com locale pt-BR base", () => {
    expect(ordenarFacetasMesa([{ valor: "z", rotulo: "Zebra" }, { valor: "a", rotulo: "árvore" }, { valor: "b", rotulo: "Bala" }], []).map(o => o.valor)).toEqual(["a", "b", "z"]);
  });
  it("preserva as contagens e a entrada", () => {
    expect(ordenarFacetasMesa(opcoes, []).map(o => o.contagem)).toEqual([18, 100, 27]);
    expect(opcoes.map(o => o.contagem)).toEqual([100, 27, 18]);
  });
  it("coloca vazios e nulos no fim mesmo marcados", () => {
    const resultado = ordenarFacetasMesa([{ valor: "__sem__", rotulo: "Sem coleção" }, { valor: null, rotulo: "Nulo" }, { valor: "", rotulo: "Vazio" }, ...opcoes], ["__sem__", ""]);
    expect(resultado.slice(0, 3).map(o => o.valor)).toEqual(["Esprit", "Fine Pure", "Le Moment"]);
    expect(new Set(resultado.slice(3).map(o => o.valor))).toEqual(new Set(["__sem__", null, ""]));
  });
  it("preserva ordem da dimensão em cada grupo de seleção", () => {
    const ordem = new Map([["Le Moment", 1], ["Fine Pure", 2], ["Esprit", 3]]);
    expect(ordenarFacetasMesa(opcoes, [], ordem).map(o => o.valor)).toEqual(["Le Moment", "Fine Pure", "Esprit"]);
    expect(ordenarFacetasMesa(opcoes, ["Esprit", "Fine Pure"], ordem).map(o => o.valor)).toEqual(["Fine Pure", "Esprit", "Le Moment"]);
  });
});

describe("parâmetros da Mesa", () => {
  it("preserva filtros, indicador e página para a consulta no banco", () => {
    const entrada = { busca: "02041", situacao: ["__sem__"], fase: ["__sem__"], colecao: ["Esprit d’Halloween"], grupo: ["Confete"], sistemas: ["sem_bling"], indicador: "ativo", ordem_coluna: "nome_comercial", ordem_dir: "desc" as const, pagina: 2, tamanho: 200 };
    expect(parametrosMesaProduto(entrada)).toEqual(entrada);
  });
  it("usa 300 ms para a busca", () => {
    expect(BUSCA_MESA_DEBOUNCE_MS).toBe(300);
  });
  it("mantém ordenação canônica para link legado com coluna inválida", () => {
    expect(parametrosMesaProduto({ busca: "", situacao: [], fase: [], colecao: [], grupo: [], sistemas: [], indicador: null, ordem_coluna: "inexistente", ordem_dir: "asc", pagina: 1, tamanho: 20 }).ordem_coluna).toBe("cod_cadastro");
  });
});