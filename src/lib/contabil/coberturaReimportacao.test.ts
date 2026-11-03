import { describe, expect, it } from "vitest";
import { causaXmlEntrada, normalizarNomeArquivo, separarCobertas, tipoFaltante } from "../../../supabase/functions/_shared/pacote-contador/cobertura";

const imp = (o: Partial<Parameters<typeof separarCobertas>[0][0]>) => ({
  id: "x", conta_bancaria_id: "c1", fonte_tipo: "csv_safra", nome_arquivo: null,
  periodo_inicio: null, periodo_fim: null, arquivo_storage_path: null, ...o,
});

describe("cobertura por reimportação", () => {
  it("nome normalizado ignora sufixo (N), caixa e acentos", () => {
    expect(normalizarNomeArquivo("Lançamentos e Devoluções (3).XLSX")).toBe("lancamentos e devolucoes.xlsx");
  });
  it("mesmo nome, mesma conta e fonte cobre", () => {
    const r = separarCobertas([imp({ id: "a", nome_arquivo: "Extrato (2).csv" })], [imp({ id: "b", nome_arquivo: "extrato.csv", arquivo_storage_path: "p" })]);
    expect(r.cobertas[0].criterio).toBe("mesmo_nome");
    expect(r.faltantes).toHaveLength(0);
  });
  it("período contido cobre", () => {
    const r = separarCobertas(
      [imp({ id: "a", nome_arquivo: "d1.csv", periodo_inicio: "2026-10-05", periodo_fim: "2026-10-05" })],
      [imp({ id: "b", nome_arquivo: "mes.csv", periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", arquivo_storage_path: "p" })]);
    expect(r.cobertas[0].criterio).toBe("periodo_contido");
  });
  it("outra conta ou outra fonte não cobre", () => {
    const sem = [imp({ id: "a", nome_arquivo: "e.csv" })];
    expect(separarCobertas(sem, [imp({ id: "b", conta_bancaria_id: "c2", nome_arquivo: "e.csv", arquivo_storage_path: "p" })]).faltantes).toHaveLength(1);
    expect(separarCobertas(sem, [imp({ id: "b", fonte_tipo: "ofx", nome_arquivo: "e.csv", arquivo_storage_path: "p" })]).faltantes).toHaveLength(1);
  });
  it("tipos e causa", () => {
    expect(tipoFaltante("04_bancos/x/mp_settlement", "mp_settlement")).toBe("mercado_pago");
    expect(tipoFaltante("04_bancos/x/ofx", "ofx")).toBe("bancario");
    expect(causaXmlEntrada("qive")).toBe("XML não guardado pelo SNCF (Qive)");
    expect(causaXmlEntrada("qive", { indisponivel_na_origem: true, erro: "x" })).toBe("Qive ainda não capturou o XML");
    expect(causaXmlEntrada("qive", { indisponivel_na_origem: false, erro: "HTTP 403" })).toBe("Qive recusou: HTTP 403");
  });
});
