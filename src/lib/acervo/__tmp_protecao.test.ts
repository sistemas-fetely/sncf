import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_t, k) {
      if (k === "range") return () => Promise.resolve({ data: [{ cod_cadastro: "7891234567890", ean: "7891234567890" }], error: null });
      return proxy;
    },
  });
  return { supabase: { from: () => proxy } };
});

const { gerarPlanilhaCadastro } = await import("./planilha-cadastro-xlsx");

const r = {
  ok: true,
  ficha: [
    { campo: "sku", bloco: "identidade", dono: "GS1", ordem: 1, rotulo: "SKU", importavel_planilha: false, dim_tabela: null },
    { campo: "ean", bloco: "identidade", dono: "GS1", ordem: 2, rotulo: "EAN", importavel_planilha: false, dim_tabela: null },
    { campo: "nome_comercial", bloco: "comercial", dono: "FOP", ordem: 3, rotulo: "Nome", importavel_planilha: true, dim_tabela: null },
    { campo: "origem", bloco: "comercial", dono: "FOP", ordem: 4, rotulo: null, importavel_planilha: true, dim_tabela: null },
  ],
  opcoes: { origem: ["nacional", "importado"] },
  destinos: [],
  produtos: [
    {
      sku: "SKU1", cod_cadastro: "7890000000001",
      valores: { sku: "SKU1", ean: "7890000000001", nome_comercial: "Vela 3" },
      sugestoes: {}, fase_atual: "registrado", proxima_fase: "pronto",
      pendencias: ["nome_comercial"], pendencias_medicao: [],
    },
  ],
};

describe("sem proteção de aba na planilha de cadastro", () => {
  it("não grava sheetProtection em nenhuma aba, mantendo autoFilter, freeze, listas e cinza", async () => {
    const blob = await gerarPlanilhaCadastro(r as never);
    const buf = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);

    const nomes: Record<string, string> = { "xl/worksheets/sheet1.xml": "cadastro", "xl/worksheets/sheet2.xml": "listas", "xl/worksheets/sheet3.xml": "Banco GS1" };
    const abas: Record<string, string> = {};
    for (const [arquivo, nome] of Object.entries(nomes)) {
      expect(zip.file(arquivo), `falta aba ${nome}`).toBeTruthy();
      abas[nome] = await zip.file(arquivo)!.async("string");
    }

    for (const [nome, xml] of Object.entries(abas)) {
      expect(xml, `aba ${nome} ainda tem sheetProtection`).not.toContain("sheetProtection");
      expect(xml, `aba ${nome} ainda tem célula travada`).not.toContain("protection");
    }

    expect(abas["cadastro"]).toContain("autoFilter");
    expect(abas["cadastro"]).toContain('state="frozen"');
    expect(abas["cadastro"]).toContain("dataValidation");
    expect(abas["cadastro"]).toContain("FFF2F2F2");
    expect(abas["Banco GS1"]).toContain("Copie o C");
    expect(abas["Banco GS1"]).toContain("7891234567890");
    expect(abas["Banco GS1"]).toContain('state="frozen"');
  }, 30000);
});
