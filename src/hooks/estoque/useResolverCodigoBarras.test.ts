import { describe, expect, it, vi } from "vitest";
import { queryCodigosBarras } from "./useResolverCodigoBarras";
import { resolverCodigoBarras } from "@/lib/estoque/resolverCodigoBarras";
const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
describe("catálogo compartilhado de bipe", () => {
  it("carrega e junta inner pelo DUN normalizado, não pelo SKU", async () => {
    from.mockImplementation((tabela) => {
      const q = { select: () => q, order: () => q, not: () => q, range: async () => ({ error: null, data: tabela === "sncf_produtos"
        ? [{ sku: "A", cod_cadastro: "01833", ean: "0631911283369", dun: "10631911283366", nome_comercial: "A" }]
        : [{ sku: "OUTRO", dun: "10631911283366", inner_qtd: 24 }] }) };
      return q;
    });
    const i = await queryCodigosBarras.queryFn();
    expect(resolverCodigoBarras("631911283369", i)?.cod).toBe("01833");
    expect(resolverCodigoBarras("10631911283366", i)?.innerQtd).toBe(24);
  });
  it("falha de leitura não vira catálogo vazio", async () => {
    from.mockImplementation(() => {
      const q = { select: () => q, order: () => q, range: async () => ({ data: null, error: new Error("Leitura recusada") }) };
      return q;
    });
    await expect(queryCodigosBarras.queryFn()).rejects.toThrow("Leitura recusada");
  });
});