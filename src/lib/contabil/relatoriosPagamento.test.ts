import { describe, expect, it } from "vitest";
import { mesesRelatorioPagamento, tiposPagamentoDaConta } from "./relatoriosPagamento";
import { pastaDocumento, pastaEntrada, resumoEntradas } from "../../../supabase/functions/_shared/pacote-contador/entrada";
import { tipoFaltante } from "../../../supabase/functions/_shared/pacote-contador/cobertura";
describe("Relatórios de pagamentos e entrada no pacote", () => {
  it("só a conta vinculada recebe os tipos de pagamentos ativos", () => {
    const t = { id: "tipo", nome: "Relatório", pasta: "pagamentos", periodicidade: "mensal", local: null, ativo: true, conta_bancaria_id: "itau" };
    expect(tiposPagamentoDaConta([t, { ...t, id: "inativo", ativo: false }, { ...t, id: "consumo", pasta: "consumo" }], "itau").map(x => x.id)).toEqual(["tipo"]);
    expect(tiposPagamentoDaConta([t], "safra")).toEqual([]);
  });
  it("oferece de novembro/2025 até o mês atual, incluindo meses sem competência", () => {
    const meses = mesesRelatorioPagamento(new Date("2026-11-12T17:45:00Z"));
    expect(meses[0]).toBe("2026-11-01"); expect(meses.at(-1)).toBe("2025-11-01"); expect(meses).toHaveLength(13); expect(meses).toContain("2026-03-01");
  });
  it("pagamentos usam a mesma pasta da conta e são faltantes bancários", () => {
    expect(pastaDocumento("pagamentos", "Itau")).toBe("04_bancos/Itau/pagamentos");
    expect(tipoFaltante(pastaDocumento("pagamentos", "Itau"))).toBe("bancario");
    expect(() => pastaDocumento("pagamentos", null)).toThrow();
    expect(pastaDocumento("consumo", null)).toBe("05_despesas/consumo");
  });
  it("separa tipos de entrada e classifica faltantes XML e PDF", () => {
    for (const tipo of ["nfe", "cte", "nfse"]) { expect(pastaEntrada(tipo)).toBe(`03_nfs_entrada/${tipo}`); expect(tipoFaltante(pastaEntrada(tipo))).toBe("xml_entrada"); }
    expect(pastaEntrada("mdfe")).toBe("03_nfs_entrada/outros");
    expect(resumoEntradas([{ tipo_documento: "cte", xml_storage_path: "x.xml", resumo_pdf_storage_path: "x.pdf" }, { tipo_documento: "cte", xml_storage_path: null, resumo_pdf_storage_path: null }]).cte).toEqual({ notas: 2, com_xml: 1, com_pdf: 1 });
  });
});
