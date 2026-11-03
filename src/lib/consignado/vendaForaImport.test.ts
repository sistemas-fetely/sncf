import { describe, expect, it } from "vitest";
import { caminhoXmlSaida, paraData, paraNumero, periodoDoNome } from "./vendaForaImport";

describe("venda fora — leitura", () => {
  it("valor com vírgula decimal vira número", () => {
    expect(paraNumero("R$ 79,26")).toBe(79.26);
    expect(paraNumero("1.234,56")).toBe(1234.56);
    expect(paraNumero("1,234.56")).toBe(1234.56);
  });
  it("data dd/mm/aaaa vira ISO", () => {
    expect(paraData("05/10/2026")).toBe("2026-10-05");
    expect(paraData("05/10/2026 14:30", true)).toBe("2026-10-05T14:30:00-03:00");
  });
  it("caminho do XML segue o padrão das NFs de saída", () => {
    expect(caminhoXmlSaida("2026-10-03T10:00:00-03:00", "1", "2")).toBe("nfs/2026-10/saida/000001-2.xml");
  });
  it("período vem do nome do resumo_seller", () => {
    expect(periodoDoNome("resumo_seller_123_2026-10-01_2026-10-31_x.xlsx")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
  });
});

// jsdom não implementa File.arrayBuffer.
const arquivo = (buf: ArrayBuffer) => ({ name: "resumo.xlsx", arrayBuffer: async () => buf }) as unknown as File;

describe("venda fora — código da loja", () => {
  it("lê 'Loja código' / 'Loja fantasia' da aba Produtos Vendidos", async () => {
    const XLSX = await import("xlsx");
    const { lerResumoSeller } = await import("./vendaForaImport");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Lacre", "Loja código", "Loja fantasia", "EAN", "Vendas"],
      ["000123", "7054", "7054- CD CASA 22 Boa Vista Village", "0789", "79,26"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos Vendidos");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const r = await lerResumoSeller(arquivo(buf));
    expect(r.loja).toBe("7054");

    const ws2 = XLSX.utils.aoa_to_sheet([["Lacre", "Loja fantasia"], ["1", "7054- CD CASA 22 Boa Vista Village"]]);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws2, "Produtos Vendidos");
    const r2 = await lerResumoSeller(arquivo(XLSX.write(wb2, { type: "array", bookType: "xlsx" })));
    expect(r2.loja).toBe("7054");
  });
});
