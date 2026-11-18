import { describe, expect, it } from "vitest";
import { BUSCA_MESA_DEBOUNCE_MS, parametrosMesaProduto } from "./mesaProdutoRpc";

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