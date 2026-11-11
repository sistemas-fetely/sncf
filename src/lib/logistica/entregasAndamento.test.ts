import { describe, expect, it } from "vitest";
import { compararAndamento, situacaoAndamento } from "./entregasAndamento";

const base = { eh_problema: false, atrasada: false, parada: false, tem_rastreio: true, dias_atraso: null, data_despacho: null };
describe("situação exclusiva de entregas em andamento", () => {
  it("ocorrência precede atraso, parada e ausência de rastreio", () => {
    expect(situacaoAndamento({ ...base, eh_problema: true, atrasada: true, parada: true, tem_rastreio: false })).toBe("ocorrencia");
  });
  it("atrasada precede parada e ausência de rastreio", () => {
    expect(situacaoAndamento({ ...base, atrasada: true, parada: true, tem_rastreio: false })).toBe("atrasada");
  });
  it("parada precede ausência de rastreio", () => {
    expect(situacaoAndamento({ ...base, parada: true, tem_rastreio: false })).toBe("parada");
  });
  it("sem rastreio somente quando tem_rastreio é false", () => {
    expect(situacaoAndamento({ ...base, tem_rastreio: false })).toBe("sem_rastreio");
    expect(situacaoAndamento({ ...base, tem_rastreio: null })).toBe("em_transito");
  });
  it("restante é em trânsito sem inferir atraso ou parada por dias", () => {
    expect(situacaoAndamento({ ...base, dias_atraso: 100 })).toBe("em_transito");
  });
  it("ordena a→e independentemente do atraso", () => {
    const linhas = [base, { ...base, tem_rastreio: false }, { ...base, parada: true }, { ...base, atrasada: true }, { ...base, eh_problema: true }];
    expect(linhas.sort(compararAndamento).map(situacaoAndamento)).toEqual(["ocorrencia", "atrasada", "parada", "sem_rastreio", "em_transito"]);
  });
  it("desempata por dias de atraso desc e despacho asc", () => {
    const linhas = [
      { ...base, dias_atraso: 2, data_despacho: "2026-01-01" },
      { ...base, dias_atraso: 5, data_despacho: "2026-11-01" },
      { ...base, dias_atraso: 5, data_despacho: "2026-10-01" },
    ];
    expect(linhas.sort(compararAndamento).map(r => r.data_despacho)).toEqual(["2026-10-01", "2026-11-01", "2026-01-01"]);
  });
});