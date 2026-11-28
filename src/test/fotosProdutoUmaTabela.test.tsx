import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const q = (data: unknown) => ({ data, isLoading: false, error: null });
vi.mock("@/hooks/useMidiaGestao", () => ({
  KEY_MIDIA: ["midia-gestao"],
  useMidiaResumo: () => q(null), useMidiaProdutos: () => q([]), useMidiaGaleria: () => q([]),
  useVariantesSemVinculo: () => q([]), useContagemSemVinculo: () => q(0),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/layout/PageHeader", () => ({ PageHeader: ({ acoes }: { acoes?: React.ReactNode }) => <div>{acoes}</div> }));
vi.mock("@/components/layout/PageShell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/tabela/RodapePaginacao", () => ({ RodapePaginacao: () => null, DEFAULT_PAGE_SIZE: 50 }));
vi.mock("@/components/produto/ProdutoAbas", () => ({ ProdutoAbas: () => null }));

import FotosProduto from "@/pages/acervo/FotosProduto";

describe("aba Fotos", () => {
  it("renderiza uma tabela só na página", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/vendas/produto/fotos"]}><FotosProduto /></MemoryRouter></QueryClientProvider>,
    );
    expect(container.querySelectorAll("table")).toHaveLength(1);
  });
});
