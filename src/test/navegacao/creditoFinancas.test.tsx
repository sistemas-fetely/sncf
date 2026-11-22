import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CasaTopNav } from "@/components/casa/CasaTopNav";
import { useCasaApp } from "@/hooks/useCasaApp";

const estado = vi.hoisted(() => ({ visiveis: new Set<string>(), permitidas: new Set(["tela.credito"]) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: [] }) }));
vi.mock("@/hooks/useAppDaRota", () => ({ useAppDaRota: () => null }));
vi.mock("@/hooks/usePermissoesDoUsuario", () => ({
  usePermissoesDoUsuario: () => ({ data: estado.permitidas }),
  TELAS_PUBLICAS: new Set(),
  temPermissaoTela: (slug: string, permitidas: Set<string>) => permitidas.has(slug),
}));
vi.mock("@/hooks/useNavegacaoPortao", () => ({
  useNavegacaoPortao: () => ({ data: [] }), resolverRegraNavegacao: () => null,
}));
vi.mock("@/hooks/useTelasVisiveis", () => ({ useTelasVisiveis: () => estado.visiveis }));
vi.mock("@/hooks/useMenuApp", () => ({ useNavegacaoMenu: () => ({ data: [
  { chave: "financas", nivel: "app", superficies: ["top"], ordem: 1, label: "Finanças", tela_slug: "tela.financeiro", rota: null },
  { chave: "financas.credito", nivel: "grupo", ordem: 1 },
  { chave: "financas.credito.lista", nivel: "item", app_chave: "financas", pai_chave: "financas.credito", superficies: ["sidebar"], ordem: 1, rota: "/credito" },
] }) }));
afterEach(() => { cleanup(); estado.visiveis = new Set(); });

it.each(["/credito", "/credito/analises/abc", "/credito/clientes", "/credito/clientes/abc", "/credito/regras-cadencia", "/credito/regua-etapas"])("%s pertence a Finanças no fallback de navegação", (rota) => {
  const { result } = renderHook(() => useCasaApp(), { wrapper: ({ children }) => <MemoryRouter initialEntries={[rota]}>{children}</MemoryRouter> });
  expect(result.current.id).toBe("financas");
});

it("Analista com tela.credito e rota de Crédito visível vê Finanças sem tela.fin_*", () => {
  estado.visiveis = new Set(["/credito"]);
  const { queryByRole } = render(<MemoryRouter><CasaTopNav /></MemoryRouter>);
  expect(queryByRole("link", { name: "Finanças" })).not.toBeNull();
});

it("sem slug de Finanças e sem rota visível não mostra Finanças", () => {
  const { queryByRole } = render(<MemoryRouter><CasaTopNav /></MemoryRouter>);
  expect(queryByRole("link", { name: "Finanças" })).toBeNull();
});