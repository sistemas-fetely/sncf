import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType, Routes, Route } from "react-router-dom";
import { useEstadoTela } from "@/lib/navegacao/useEstadoTela";
import { useFocoAoVoltar } from "@/lib/navegacao/useFocoAoVoltar";
import { useRestaurarScroll, chaveScroll } from "@/lib/navegacao/useRestaurarScroll";
import { abrirDetalhe, montarFrom } from "@/lib/navegacao/abrirDetalhe";

const loc = { current: "" , tipo: "" };
function Espia() {
  const l = useLocation();
  loc.current = l.pathname + l.search;
  loc.tipo = useNavigationType();
  return null;
}

describe("useEstadoTela", () => {
  const D = { busca: "", uf: "todas", pagina: 1, so: false };
  let api: ReturnType<typeof useEstadoTela<typeof D>>;
  function Tela() {
    api = useEstadoTela(D, { replaceKeys: ["busca"] });
    return <Espia />;
  }
  const montar = (url: string) =>
    render(<MemoryRouter initialEntries={[url]}><Tela /></MemoryRouter>);

  it("default não aparece na URL", () => {
    montar("/x");
    act(() => api[1]({ uf: "todas", pagina: 1 }));
    expect(loc.current).toBe("/x");
  });
  it("parse number e boolean", () => {
    montar("/x?pagina=2&so=1");
    expect(api[0].pagina).toBe(2);
    expect(api[0].so).toBe(true);
  });
  it("busca usa replace; página usa push", () => {
    montar("/x");
    act(() => api[1]({ busca: "ana" }));
    expect(loc.tipo).toBe("REPLACE");
    act(() => api[1]({ pagina: 3 }));
    expect(loc.tipo).toBe("PUSH");
    expect(loc.current).toBe("/x?busca=ana&pagina=3");
  });
  it("preserva chave externa", () => {
    montar("/x?aba=fila");
    act(() => api[1]({ uf: "SP" }));
    expect(loc.current).toBe("/x?aba=fila&uf=SP");
  });
});

describe("useFocoAoVoltar", () => {
  it("id visível: marca o elemento e remove foco", () => {
    function Tela() {
      useFocoAoVoltar({ pronto: true, idsVisiveis: ["A"] });
      return <><div data-foco-id="A" /><Espia /></>;
    }
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(<MemoryRouter initialEntries={["/x?foco=A&uf=SP"]}><Tela /></MemoryRouter>);
    expect(container.querySelector('[data-foco-id="A"]')!.classList.contains("foco-navegacao")).toBe(true);
    expect(loc.current).toBe("/x?uf=SP");
  });
  it("id ausente: chama callback", () => {
    const cb = vi.fn();
    function Tela() {
      useFocoAoVoltar({ pronto: true, idsVisiveis: ["B"], aoNaoEncontrar: cb });
      return <Espia />;
    }
    render(<MemoryRouter initialEntries={["/x?foco=A"]}><Tela /></MemoryRouter>);
    expect(cb).toHaveBeenCalledWith("A");
    expect(loc.current).toBe("/x");
  });
});

describe("useRestaurarScroll", () => {
  it("salva no unmount e restaura por chave", () => {
    function Tela({ pronto }: { pronto: boolean }) {
      useRestaurarScroll(null, pronto);
      return null;
    }
    const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
    const r = render(<MemoryRouter initialEntries={["/x?uf=SP"]}><Tela pronto={false} /></MemoryRouter>);
    r.unmount();
    expect(sessionStorage.getItem(chaveScroll("/x", "?uf=SP"))).toBe("420");
    render(<MemoryRouter initialEntries={["/x?uf=SP&foco=Z"]}><Routes><Route path="/x" element={<Tela pronto />} /></Routes></MemoryRouter>);
    expect(spy).not.toHaveBeenCalled(); // foco manda
    render(<MemoryRouter initialEntries={["/x?uf=SP"]}><Tela pronto /></MemoryRouter>);
    expect(spy).toHaveBeenCalledWith(0, 420);
  });
});

describe("abrirDetalhe", () => {
  it("monta from sem e com query", () => {
    expect(montarFrom("/b2c", "", "P1")).toBe("/b2c?foco=P1");
    expect(montarFrom("/b2c", "?uf=SP&foco=old", "P1")).toBe("/b2c?uf=SP&foco=P1");
    const nav = vi.fn();
    abrirDetalhe(nav, { pathname: "/b2c", search: "?pagina=2" }, "/pedidos/P1", { foco: "P1", label: "Pedidos B2C" });
    expect(nav).toHaveBeenCalledWith("/pedidos/P1", { state: { from: "/b2c?pagina=2&foco=P1", fromLabel: "Pedidos B2C" } });
  });
});
