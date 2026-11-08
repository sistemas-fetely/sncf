import { describe, expect, it } from "vitest";
import { compararCelula, validarSlugs, normalizarCodigo, donoCampo } from "../../../supabase/functions/_shared/catalogo-planilha/comparacao";
describe("catálogo diário — comparação de três vias", () => {
  it("mudança quando sistema continua na base", () => expect(compararCelula("A", "B", "A")).toBe("mudanca"));
  it("conflito quando ambos mudaram diferentemente", () => expect(compararCelula("A", "B", "C")).toBe("conflito"));
  it("já igual não precisa aplicação", () => expect(compararCelula("A", "B", "B")).toBe("ja_igual"));
  it("base aplicada é a referência, não a leitura anterior", () => expect(compararCelula("A", "B", "A")).toBe("mudanca"));
  it("vazio/apagado nunca mexe", () => { expect(compararCelula("A", "", "C")).toBeNull(); expect(compararCelula("A", null, "C")).toBeNull(); });
  it("planilha igual à base não altera sistema", () => expect(compararCelula("A", "A", "C")).toBeNull());
  it("código numérico mantém cinco casas", () => expect(normalizarCodigo(123)).toBe("00123"));
  it("layout exige cod_cadastro na linha 3", () => expect(() => validarSlugs(["ncm"], [{ campo: "ncm" }])).toThrow("sem cod_cadastro"));
  it("layout rejeita slug desconhecido", () => expect(() => validarSlugs(["cod_cadastro", "nao_existe"], [])).toThrow("desconhecido"));
  it("fase e ativo conhecidos nunca são importáveis", () => expect(() => validarSlugs(["cod_cadastro", "fase", "ativo"], [])).not.toThrow());
  it("Operações só recebe quatro campos fiscais da matriz", () => { expect(donoCampo({campo:"ncm",onde_resolver:"SNCF"})).toBe("operacoes"); expect(donoCampo({campo:"peso_g",onde_resolver:"FOP"})).toBe("produto"); expect(donoCampo({campo:"multiplos",onde_resolver:"SNCF"})).toBe("produto"); });
});