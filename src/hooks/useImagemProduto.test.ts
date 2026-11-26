import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), in: vi.fn(), useQuery: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));

import { buscarImagensProdutos, useImagensPorCod, useImagensPorSku } from "./useImagemProduto";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ in: mocks.in });
  mocks.in.mockResolvedValue({ data: [], error: null });
  mocks.useQuery.mockImplementation((options) => options);
});

describe("fonte única de imagens", () => {
  it("consulta somente a view final em fatias de no máximo 300", async () => {
    const codigos = Array.from({ length: 601 }, (_, i) => String(i).padStart(5, "0"));
    await buscarImagensProdutos("cod_cadastro", codigos);
    expect(mocks.from.mock.calls).toEqual(Array.from({ length: 3 }, () => ["vw_produto_imagem_final"]));
    expect(mocks.in.mock.calls).toEqual([
      ["cod_cadastro", codigos.slice(0, 300)],
      ["cod_cadastro", codigos.slice(300, 600)],
      ["cod_cadastro", codigos.slice(600)],
    ]);
  });

  it("ignora entradas vazias e duplicadas, sem transformar identificadores", async () => {
    await buscarImagensProdutos("sku", [null, undefined, "", "   ", "Ab-C", "Ab-C", "ab-c"]);
    expect(mocks.in).toHaveBeenCalledExactlyOnceWith("sku", ["Ab-C", "ab-c"]);
  });

  it("mapa por código inclui só URLs não nulas e preserva origem e flag da view", async () => {
    mocks.in.mockResolvedValue({ data: [
      { sku: "A", cod_cadastro: "02160", imagem_url: "/fop.jpg", origem: "fop", imagem_do_produto: true },
      { sku: "B", cod_cadastro: "02161", imagem_url: null, origem: null, imagem_do_produto: false },
      { sku: "C", cod_cadastro: "02162", imagem_url: "/colecao.jpg", origem: "colecao", imagem_do_produto: false },
    ], error: null });
    const mapa = await buscarImagensProdutos("cod_cadastro", ["02160", "02161", "02162"]);
    expect([...mapa]).toEqual([
      ["02160", { imagem_url: "/fop.jpg", origem: "fop", imagem_do_produto: true }],
      ["02162", { imagem_url: "/colecao.jpg", origem: "colecao", imagem_do_produto: false }],
    ]);
  });

  it("mapa por SKU usa o SKU e não o código", async () => {
    mocks.in.mockResolvedValue({ data: [
      { sku: "Jingle-Pop", cod_cadastro: "02160", imagem_url: "/produto.jpg", origem: "propria", imagem_do_produto: true },
    ], error: null });
    const mapa = await buscarImagensProdutos("sku", ["Jingle-Pop"]);
    expect(mapa.get("Jingle-Pop")).toEqual({ imagem_url: "/produto.jpg", origem: "propria", imagem_do_produto: true });
    expect(mapa.has("02160")).toBe(false);
  });

  it("falha com a mensagem real, sem devolver resultado parcial", async () => {
    mocks.in.mockResolvedValueOnce({ data: [
      { sku: "A", cod_cadastro: "00000", imagem_url: "/produto.jpg", origem: "propria", imagem_do_produto: true },
    ], error: null }).mockResolvedValueOnce({ data: null, error: { message: "Falha específica da leitura de fotos" } });
    await expect(buscarImagensProdutos("cod_cadastro", Array.from({ length: 301 }, (_, i) => String(i).padStart(5, "0"))))
      .rejects.toThrow("Falha específica da leitura de fotos");
  });

  it("não consulta o banco com lista vazia", async () => {
    expect(await buscarImagensProdutos("sku", [null, undefined])).toEqual(new Map());
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    [useImagensPorCod, "cod_cadastro"],
    [useImagensPorSku, "sku"],
  ] as const)("hooks usam cache de 10 minutos e chave ordenada por campo (%s)", (hook, campo) => {
    hook(["B", "A", "B"]);
    expect(mocks.useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ["produto-imagem-final", campo, ["A", "B"]],
      staleTime: 600_000,
      enabled: true,
    }));
    hook([null, undefined, ""]);
    expect(mocks.useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
});