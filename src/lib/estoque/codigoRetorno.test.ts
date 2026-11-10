import { describe, expect, it } from "vitest";
import { resolverCodigoRetorno, unidadesBipeRetorno, type ProdutoRetorno } from "./codigoRetorno";

import { montarIndiceBarras } from "./resolverCodigoBarras";

const produto: ProdutoRetorno = { sku: "SKU-A", cod: "001", nome: "A", dun: "17890000000001", innerQtd: 24 };

describe("bipe da devolução", () => {
  it("multiplica conteúdo físico por Qtd de caixas", () => {
    expect(unidadesBipeRetorno(produto, 3)).toBe(72);
  });
  it("inner nulo exige unidades explícitas, não lança Qtd caixas", () => {
    expect(unidadesBipeRetorno({ ...produto, innerQtd: null }, 3)).toBeNull();
  });
  it("inner 1 também exige unidades explícitas", () => {
    expect(unidadesBipeRetorno({ ...produto, innerQtd: 1 }, 3)).toBeNull();
  });
  it("EAN/código/SKU continuam contando unidades", () => {
    expect(unidadesBipeRetorno({ sku: "SKU-A", nome: "A", cod: "001" }, 3)).toBe(3);
  });
  it("delega resolução normalizada ao índice compartilhado", () => {
    const indice = montarIndiceBarras([{ sku: "SKU-A", ean: "0789000000000", dun: "17890000000001", cod_cadastro: "001", nome_comercial: "A", inner_qtd: 24 }]);
    expect(resolverCodigoRetorno("789000000000", indice)?.sku).toBe("SKU-A");
    expect(unidadesBipeRetorno(resolverCodigoRetorno("17890000000001", indice) ?? produto, 2)).toBe(48);
  });
});
