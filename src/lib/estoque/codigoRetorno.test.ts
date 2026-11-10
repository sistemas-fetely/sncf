import { describe, expect, it, vi } from "vitest";
import { resolverCodigoRetorno, unidadesBipeRetorno, type ProdutoRetorno } from "./codigoRetorno";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const produto: ProdutoRetorno = { sku: "SKU-A", cod: "001", nome: "A", dun: "17890000000001", innerQtd: 24 };

function banco(campoResolvido: string, inner: number | null = 24, falha = false) {
  const filtros: [string, string, string][] = [];
  const from = vi.fn((tabela: string) => {
    let campo = "";
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn((c: string, valor: string) => { campo = c; filtros.push([tabela, c, valor]); return q; }),
      ilike: vi.fn((c: string, valor: string) => { campo = c; filtros.push([tabela, c, valor]); return q; }),
      limit: vi.fn(async () => ({ error: null, data: campo === campoResolvido ? [{ sku: "SKU-A", cod_cadastro: "001", nome_comercial: "A", dun: produto.dun }] : [] })),
      maybeSingle: vi.fn(async () => ({ error: falha ? new Error("leitura recusada") : null, data: { inner_qtd: inner } })),
    };
    return q;
  });
  return { sb: { from } as unknown as Parameters<typeof resolverCodigoRetorno>[1], from, filtros };
}

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
  it("resolve DUN em sncf_produtos e inner do cartório vinculado pelo DUN", async () => {
    const b = banco("dun");
    expect(await resolverCodigoRetorno(produto.dun ?? "", b.sb)).toEqual(produto);
    expect(b.filtros.at(-1)).toEqual(["cartorio_codigo", "dun", "17890000000001"]);
    expect(b.from.mock.calls.map(([t]) => t)).toEqual(["sncf_produtos", "sncf_produtos", "sncf_produtos", "sncf_produtos", "cartorio_codigo"]);
  });
  it.each(["ean", "cod_cadastro", "sku"])("preserva resolução por %s sem consultar conteúdo de caixa", async (campo) => {
    const b = banco(campo);
    expect(await resolverCodigoRetorno("001", b.sb)).toEqual({ sku: "SKU-A", cod: "001", nome: "A" });
    expect(b.from).not.toHaveBeenCalledWith("cartorio_codigo");
  });
  it("SKU fora da devolução resolve sem filtrar pela declaração", async () => {
    const b = banco("dun");
    const encontrado = await resolverCodigoRetorno("17890000000001", b.sb);
    expect(encontrado && unidadesBipeRetorno(encontrado, 2)).toBe(48);
  });
  it("não disfarça erro no cartório como quantidade desconhecida", async () => {
    const b = banco("dun", null, true);
    await expect(resolverCodigoRetorno("17890000000001", b.sb)).rejects.toThrow("leitura recusada");
  });
});