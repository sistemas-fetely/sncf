import { describe, expect, it } from "vitest";
import { statusDocumentoEsperado, type DocDespesa } from "./documentosDespesa";

const doc = (competencia: string, tipo_id = "t1"): DocDespesa => ({ id: competencia, competencia, tipo_id, pasta: "consumo", storage_path: "x", nome_arquivo: "f.pdf", descricao: null });

describe("Documentos de despesa esperados", () => {
  it("mensal: documento de setembro não vale para outubro", () => {
    expect(statusDocumentoEsperado({ id: "t1", periodicidade: "mensal" }, [doc("2026-09-01")], "2026-10-01").enviado).toBe(false);
  });
  it("mensal: documento do próprio mês conta como enviado", () => {
    expect(statusDocumentoEsperado({ id: "t1", periodicidade: "mensal" }, [doc("2026-10-01")], "2026-10-01").enviado).toBe(true);
  });
  it("contrato vigente: enviado em setembro continua valendo em outubro", () => {
    expect(statusDocumentoEsperado({ id: "t1", periodicidade: "contrato_vigente" }, [doc("2026-09-01")], "2026-10-01").enviado).toBe(true);
  });
  it("contrato vigente: enviado em novembro não vale para outubro", () => {
    expect(statusDocumentoEsperado({ id: "t1", periodicidade: "contrato_vigente" }, [doc("2026-11-01")], "2026-10-01").enviado).toBe(false);
  });
});
