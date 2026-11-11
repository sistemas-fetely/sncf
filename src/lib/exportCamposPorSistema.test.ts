import { describe, expect, it, vi } from "vitest";
import { ABAS_EXPORT, criarWorkbookCampos, exportCamposPorSistema, lerTodasLinhas, valorExcel, valorPreenchido, type CabecalhoCampo } from "./exportCamposPorSistema";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("valores da exportação", () => {
  it("considera null, texto vazio, array vazio e objeto vazio não preenchidos", () => {
    for (const valor of [null, "", [], {}]) expect(valorPreenchido(valor)).toBe(false);
    for (const valor of [0, false, "0", [null], { a: null }]) expect(valorPreenchido(valor)).toBe(true);
  });
  it("preserva números e códigos com zero inicial", () => {
    expect(valorExcel(12.5)).toBe(12.5);
    expect(valorExcel("0012345678901")).toBe("0012345678901");
  });
  it("traduz booleanos e serializa JSON somente com conteúdo", () => {
    expect(valorExcel(true)).toBe("Sim");
    expect(valorExcel(false)).toBe("Não");
    expect(valorExcel([])).toBeNull();
    expect(valorExcel({})).toBeNull();
    expect(valorExcel([1, 2])).toBe("[1,2]");
    expect(valorExcel({ a: 2 })).toBe('{"a":2}');
  });
  it("trunca texto em 32.000 caracteres", () => {
    expect(String(valorExcel("a".repeat(32_001))).length).toBe(32_000);
  });
  it("reconhece data ISO sem interpretar código numérico como data", () => {
    expect(valorExcel("2026-11-11T21:59:00Z")).toEqual(new Date("2026-11-11T21:59:00Z"));
    expect(valorExcel("20261111")).toBe("20261111");
  });
});

describe("leituras completas", () => {
  it.each([1205, 934, 1275, 2000])("exporta todas as %i linhas com páginas de mil", async total => {
    const base = Array.from({ length: total }, (_, i) => ({ codigo: i }));
    const ler = vi.fn(async (_view: string, inicio: number, fim: number) => base.slice(inicio, fim + 1));
    expect(await lerTodasLinhas("view", ler)).toEqual(base);
    expect(ler.mock.calls[0].slice(1, 3)).toEqual([0, 999]);
    if (total > 1000) expect(ler.mock.calls[1].slice(1, 3)).toEqual([1000, 1999]);
  });
  it("falha sem gerar arquivo parcial quando qualquer leitura falha", async () => {
    const ler = vi.fn(async (view: string) => {
      if (view === "vw_produto_export_bling") throw new Error("Bling: leitura recusada");
      return [];
    });
    await expect(exportCamposPorSistema(ler)).rejects.toThrow("Bling: leitura recusada");
  });
});

describe("colunas dinâmicas e preenchimento", () => {
  const cabecalhos: CabecalhoCampo[] = ABAS_EXPORT.flatMap(aba => [
    { aba: aba.chave, ordem: 20, coluna: "extra", campo_tecnico: "extra", sistema: "Bling", owner: "Sistema", obrigatoriedade: null, bloco: "B", rotulo: "Extra", integracao: null },
    { aba: aba.chave, ordem: 10, coluna: "codigo", campo_tecnico: "codigo", sistema: "SNCF", owner: "Operações", obrigatoriedade: null, bloco: "B", rotulo: "Código", integracao: null },
  ]);
  it("segue somente as colunas e a ordem do cabeçalho e calcula a taxa sobre todas as linhas", () => {
    const dados = Object.fromEntries(ABAS_EXPORT.map(aba => [aba.chave, [{ codigo: "001", extra: null, ignorado: 1 }, { codigo: null, extra: false }]]));
    const wb = criarWorkbookCampos(cabecalhos, dados);
    expect(wb.worksheets.map(ws => ws.name)).toEqual(["SNCF & FOP", "Bling", "Shopify", "Legenda"]);
    const ws = wb.worksheets[0];
    expect(ws.getCell("B8").value).toBe("001");
    expect(ws.getCell("C9").value).toBe("Não");
    expect(ws.getCell("B6").value).toBe("50% (1/2)");
    expect(ws.getCell("C6").value).toBe("50% (1/2)");
    expect(ws.columnCount).toBe(3);
    expect(ws.getCell("A8").value).toBeNull();
  });
  it("recusa coluna ausente na view, em vez de exportar vazios falsos", () => {
    const dados = Object.fromEntries(ABAS_EXPORT.map(aba => [aba.chave, [{ codigo: "001" }]]));
    expect(() => criarWorkbookCampos(cabecalhos, dados)).toThrow("coluna extra ausente");
  });
});