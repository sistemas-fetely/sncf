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
