import { describe, expect, it, vi, beforeEach } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { exportarLista, montarParamsLista, numeroAgregado, gruposAgregado } from "./useListaPaginada";

describe("fn_lista agregados e exportação", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("repassa percentis, agrupamento mensal, filtro próprio, ignorar e ordem absoluta", () => {
    expect(montarParamsLista({ relacao: "vw_xpm_risco_atraso", busca: "  2417 ",
      ordem: [{ c: "diferenca", dir: "desc", abs: true }],
      agregados: [{ id: "p90", fn: "pct", c: "horas_ciclo_liquido", p: 0.9,
        por: [{ c: "t_expedido", trunc: "month" }], onde: [{ c: "concluida", op: "eq", v: true }], ignorar: ["__busca__"] }],
    })).toEqual({ relacao: "vw_xpm_risco_atraso", busca: "2417", filtros: [],
      ordem: [{ c: "diferenca", dir: "desc", abs: true }],
      agregados: [{ id: "p90", fn: "pct", c: "horas_ciclo_liquido", p: 0.9,
        por: [{ c: "t_expedido", trunc: "month" }], onde: [{ c: "concluida", op: "eq", v: true }], ignorar: ["__busca__"] }],
    });
  });
  it("exporta 1205 itens em páginas de 500 preservando o filtro", async () => {
    const linhas = Array.from({ length: 1205 }, (_, id) => ({ id }));
    rpc.mockImplementation(async (_nome, { p }) => ({ error: null, data: {
      total: 1205, pagina: p.pagina, tamanho: p.tamanho,
      linhas: linhas.slice((p.pagina - 1) * p.tamanho, p.pagina * p.tamanho),
      agregados: { total: 1205 },
    } }));
    const filtro = [{ c: "colecao", op: "eq" as const, v: "Esprit d'Halloween" }];
    expect(await exportarLista({ relacao: "vw_preco_espelho", filtros: filtro, ordem: [{ c: "sku", dir: "asc" }] })).toEqual(linhas);
    expect(rpc.mock.calls.map(([, { p }]) => [p.pagina, p.tamanho, p.filtros])).toEqual([[1, 500, filtro], [2, 500, filtro], [3, 500, filtro]]);
    expect(rpc.mock.calls.every(([nome]) => nome === "fn_lista")).toBe(true);
  });
  it("não entrega exportação parcial quando a segunda página falha", async () => {
    const erro = { message: "Leitura recusada" };
    rpc.mockResolvedValueOnce({ data: { total: 1205, linhas: Array(500).fill({ id: 1 }) }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: erro });
    await expect(exportarLista({ relacao: "vw_preco_espelho" })).rejects.toBe(erro);
  });
  it("recusa fim prematuro antes do total", async () => {
    rpc.mockResolvedValue({ data: { total: 1205, linhas: [] }, error: null });
    await expect(exportarLista({ relacao: "vw_preco_espelho" })).rejects.toThrow("antes do total");
  });
  it("lê o agregado completo mesmo quando difere da página", () => {
    const agregados = { total: 1205, colecao: [{ colecao: "Esprit d'Halloween", valor: 18 }] };
    expect(numeroAgregado(agregados, "total")).toBe(1205);
    expect(gruposAgregado(agregados, "colecao")).toEqual([{ colecao: "Esprit d'Halloween", valor: 18 }]);
  });
});