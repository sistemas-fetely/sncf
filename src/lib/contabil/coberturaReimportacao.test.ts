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
    expect(r.cobertas[0].criterio).toBe("periodo_coberto_na_competencia");
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

describe("cobertura por período na competência (10/2026)", () => {
  const out = { inicio: "2026-10-01", fim: "2026-10-31" };
  it("OFX Itaú 28/09–09/10 coberto pela reimportação 01/10–30/10", () => {
    const r = separarCobertas(
      [imp({ id: "a", fonte_tipo: "ofx", nome_arquivo: "Extrato_6754_993100_13-10-2026.ofx", periodo_inicio: "2026-09-28", periodo_fim: "2026-10-09" })],
      [imp({ id: "b", fonte_tipo: "ofx", nome_arquivo: "Extrato_6754_993100_03-11-2026.ofx", periodo_inicio: "2026-10-01", periodo_fim: "2026-10-30", arquivo_storage_path: "p" })], out);
    expect(r.faltantes).toHaveLength(0);
    expect(r.cobertas[0].criterio).toBe("periodo_coberto_na_competencia");
  });
  it("settlement MP 29/08–14/10 coberto pela união dos diários de outubro", () => {
    const diarios = Array.from({ length: 14 }, (_, i) => {
      const d = `2026-10-${String(i + 1).padStart(2, "0")}`;
      return imp({ id: `d${i}`, fonte_tipo: "mp_settlement", nome_arquivo: `settlement-${d}.csv`, periodo_inicio: d, periodo_fim: d, arquivo_storage_path: "p" });
    });
    const r = separarCobertas([imp({ id: "a", fonte_tipo: "mp_settlement", nome_arquivo: "settlement_v2-3201320885-manual-2026-10-13-073043.xlsx", periodo_inicio: "2026-08-29", periodo_fim: "2026-10-14" })], diarios, out);
    expect(r.faltantes).toHaveLength(0);
    expect(r.cobertas[0].com_arquivos).toHaveLength(14);
  });
  it("um dia descoberto continua faltante", () => {
    const r = separarCobertas([imp({ id: "a", fonte_tipo: "mp_settlement", nome_arquivo: "x.xlsx", periodo_inicio: "2026-08-29", periodo_fim: "2026-10-14" })], [
      imp({ id: "b", fonte_tipo: "mp_settlement", nome_arquivo: "1.csv", periodo_inicio: "2026-10-01", periodo_fim: "2026-10-06", arquivo_storage_path: "p" }),
      imp({ id: "c", fonte_tipo: "mp_settlement", nome_arquivo: "2.csv", periodo_inicio: "2026-10-08", periodo_fim: "2026-10-14", arquivo_storage_path: "p" }),
    ], out);
    expect(r.faltantes).toHaveLength(1);
  });
});
