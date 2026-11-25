import { describe, it, expect } from "vitest";
import { mensagem } from "./useVerificarNfBling";
describe("mensagem verificar NF", () => {
  it("cancelada diz cancelada no Bling", () => expect(mensagem({ bling_id: "1", numero: "000208", de: "autorizada", para: "cancelada" })).toBe("NF 000208: cancelada no Bling"));
  it("autorizada sem mudança diz ainda autorizada", () => expect(mensagem({ bling_id: "1", numero: "1", de: "autorizada", para: "autorizada" })).toBe("NF 1 ainda autorizada no Bling"));
  it("pendente → autorizada continua ✓", () => expect(mensagem({ bling_id: "1", numero: "1", de: "pendente", para: "autorizada" })).toBe("NF 1 autorizada ✓"));
});
