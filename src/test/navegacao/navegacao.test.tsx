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

describe("useEstadoTela com prefixo", () => {
  it("escreve mc_busca, estado sem prefixo, ignora chave sem prefixo", () => {
    const D = { busca: "", grupo: "em_andamento" };
    let api!: ReturnType<typeof useEstadoTela<typeof D>>;
    function Tela() {
      api = useEstadoTela(D, { replaceKeys: ["busca"], prefixo: "mc" });
      return <Espia />;
    }
    render(<MemoryRouter initialEntries={["/x?busca=casa&grupo=todas"]}><Tela /></MemoryRouter>);
    expect(api[0].busca).toBe("");
    expect(api[0].grupo).toBe("em_andamento");
    act(() => api[1]({ busca: "x" }));
    expect(loc.current).toBe("/x?busca=casa&grupo=todas&mc_busca=x");
    expect(api[0].busca).toBe("x");
  });
});

describe("abrirDetalhe com focoParam", () => {
  it("usa mc_foco e preserva aba e mc_*", () => {
    expect(montarFrom("/pedidos", "?aba=recuperacao&mc_busca=a&foco=Z", "P1", "mc_foco"))
      .toBe("/pedidos?aba=recuperacao&mc_busca=a&foco=Z&mc_foco=P1");
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

describe("useEstadoTela com prefixo e boolean/ordem (Leva 2)", () => {
  it("mesa_vencido=1 e ordem coluna:dir; default sai da URL", () => {
    const D = { vencido: false, ordem: "" };
    let api!: ReturnType<typeof useEstadoTela<typeof D>>;
    function Tela() {
      api = useEstadoTela(D, { prefixo: "mesa" });
      return <Espia />;
    }
    render(<MemoryRouter initialEntries={["/recebimento/cobranca?aba=mesa"]}><Tela /></MemoryRouter>);
    act(() => api[1]({ vencido: true, ordem: "valor:desc" }));
    expect(loc.current).toBe("/recebimento/cobranca?aba=mesa&mesa_vencido=1&mesa_ordem=valor%3Adesc");
    expect(api[0].vencido).toBe(true);
    act(() => api[1]({ vencido: false, ordem: "" }));
    expect(loc.current).toBe("/recebimento/cobranca?aba=mesa");
  });
});

describe("useEstadoTela — datas de/até (Títulos)", () => {
  const D = { vencDe: "", vencAte: "" };
  let api: ReturnType<typeof useEstadoTela<typeof D>>;
  function Tela() {
    api = useEstadoTela(D, { prefixo: "tit" });
    return <Espia />;
  }
  it("default vazio fica fora da URL; data entra e volta como string", () => {
    render(<MemoryRouter initialEntries={["/c?aba=titulos"]}><Tela /></MemoryRouter>);
    expect(loc.current).toBe("/c?aba=titulos");
    act(() => api[1]({ vencDe: "2026-10-01", vencAte: "2026-10-31" }));
    expect(loc.current).toContain("tit_vencDe=2026-10-01");
    expect(loc.current).toContain("tit_vencAte=2026-10-31");
    expect(api[0].vencDe).toBe("2026-10-01");
    expect(typeof api[0].vencDe).toBe("string");
    act(() => api[1]({ vencDe: "", vencAte: "" }));
    expect(loc.current).toBe("/c?aba=titulos");
  });
  it("lê a data da URL ao voltar", () => {
    render(<MemoryRouter initialEntries={["/c?tit_vencDe=2026-10-01"]}><Tela /></MemoryRouter>);
    expect(api[0].vencDe).toBe("2026-10-01");
    expect(api[0].vencAte).toBe("");
  });
});

describe("chaveScroll ignora qualquer *_foco", () => {
  it("tit_foco e sp_foco não mudam a chave", () => {
    expect(chaveScroll("/x", "?a=1&tit_foco=9&sp_foco=2")).toBe(chaveScroll("/x", "?a=1"));
  });
});

describe("useEstadoTela — duas escritas no mesmo clique", () => {
  const D = { busca: "", page: 1 };
  let api: ReturnType<typeof useEstadoTela<typeof D>>;
  function Tela() { api = useEstadoTela(D, { prefixo: "b2b" }); return <Espia />; }
  it("busca e página na mesma ação ficam ambas na URL", () => {
    render(<MemoryRouter initialEntries={["/c?b2b_page=3"]}><Tela /></MemoryRouter>);
    act(() => { api[1]({ busca: "a" }); api[1]({ page: 1 }); });
    expect(loc.current).toBe("/c?b2b_busca=a");
  });
});
