import { describe, it, expect } from "vitest";
import { itensRecebimentoRetorno, podeGerarRetorno, retornoPendente } from "./retornoEventoRegras";
describe("retorno do evento", () => {
  it("contagem só envia SKU e recebido, incluindo zero", () => {
    expect(itensRecebimentoRetorno([{ sku: "A", enviado: 2 }, { sku: "B", enviado: 1 }], (sku) => sku === "A" ? 1 : 0)).toEqual([{ sku: "A", recebido: 1 }, { sku: "B", recebido: 0 }]);
  });
  it("recusa contagem maior que enviado", () => expect(() => itensRecebimentoRetorno([{ sku: "A", enviado: 2 }], () => 3)).toThrow());
  it("NF independe da diferenca aberta", () => expect(podeGerarRetorno({ recebido_em: "2026-11-17", nf_status: null })).toBe(true));
  it("rascunho gerando e autorizada nao geram novamente", () => {
    for (const nf_status of ["rascunho", "gerando", "autorizada"]) expect(podeGerarRetorno({ recebido_em: "2026-11-17", nf_status })).toBe(false);
  });
  it("nao gera antes de receber", () => expect(podeGerarRetorno({ recebido_em: null, nf_status: null })).toBe(false));
  it("permite erro depois de recebido", () => expect(podeGerarRetorno({ recebido_em: "2026-11-17", nf_status: "erro" })).toBe(true));
  it("mantem pendencia de diferenca com NF autorizada", () => expect(retornoPendente({ recebido_em: "2026-11-17", diferenca_status: "aberta", nf_status: "autorizada" })).toBe(true));
  it("remove card somente sem diferenca e NF autorizada", () => expect(retornoPendente({ recebido_em: "2026-11-17", diferenca_status: "resolvida", nf_status: "autorizada" })).toBe(false));
});