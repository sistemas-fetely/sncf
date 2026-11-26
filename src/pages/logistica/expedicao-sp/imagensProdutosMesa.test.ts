import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ buscar: vi.fn(), useQuery: vi.fn() }));
vi.mock("@/hooks/useImagemProduto", () => ({ buscarImagensProdutos: mocks.buscar }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

import { useImagensProdutosMesa } from "./useMesaSp";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useQuery.mockImplementation((options) => options);
});

describe("fotos não são caminho crítico na Mesa", () => {
  it("lê por SKU e preserva os metadados da fonte final", async () => {
    mocks.buscar.mockResolvedValue(new Map([
      ["CL-JP-JAM-41-BLU", { imagem_url: "/foto.jpg", origem: "fop", imagem_do_produto: true }],
    ]));
    useImagensProdutosMesa(["CL-JP-JAM-41-BLU"]);
    const options = mocks.useQuery.mock.calls[0][0];
    expect(options.staleTime).toBe(600_000);
    expect(await options.queryFn()).toEqual(new Map([
      ["CL-JP-JAM-41-BLU", { sku: "CL-JP-JAM-41-BLU", imagem_url: "/foto.jpg", origem: "fop", imagem_do_produto: true }],
    ]));
    expect(mocks.buscar).toHaveBeenCalledExactlyOnceWith("sku", ["CL-JP-JAM-41-BLU"]);
  });

  it("falha de foto retorna mapa vazio e avisa no console, nunca lança", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      mocks.buscar.mockRejectedValue({ message: "Falha específica da fonte final" });
      useImagensProdutosMesa(["CL-JP-JAM-41-BLU"]);
      const options = mocks.useQuery.mock.calls[0][0];
      await expect(options.queryFn()).resolves.toEqual(new Map());
      expect(warn).toHaveBeenCalledExactlyOnceWith("fotos dos produtos indisponíveis: Falha específica da fonte final");
    } finally {
      warn.mockRestore();
    }
  });
});