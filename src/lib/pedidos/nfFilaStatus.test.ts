import { describe, expect, it } from "vitest";
import {
  nfFilaApareceNaTrilha,
  nfFilaPodeReenviar,
  nfFilaStatusMeta,
  STATUS_AGUARDANDO_XPM,
} from "./nfFilaStatus";

describe("status de xpm_nf_fila na trilha do pedido", () => {
  it("rotula aguardando_xpm como espera informativa, com tooltip e sem reenvio", () => {
    const meta = nfFilaStatusMeta(STATUS_AGUARDANDO_XPM);
    expect(meta).not.toBeNull();
    expect(meta?.rotulo).toBe("Aguardando conferência da XPM");
    expect(meta?.estado).toBe("info");
    expect(meta?.tooltip).toBe(
      "A NF é enviada sozinha quando a XPM concluir a conferência do pedido.",
    );
    expect(meta?.podeReenviar).toBe(false);
  });

  it("mostra aguardando_xpm na trilha, mas sem oferecer reenvio", () => {
    expect(nfFilaApareceNaTrilha("aguardando_xpm")).toBe(true);
    expect(nfFilaPodeReenviar("aguardando_xpm")).toBe(false);
  });

  it("mantém pendente e erro como linhas de reenvio", () => {
    expect(nfFilaApareceNaTrilha("pendente")).toBe(true);
    expect(nfFilaApareceNaTrilha("erro")).toBe(true);
    expect(nfFilaPodeReenviar("pendente")).toBe(true);
    expect(nfFilaPodeReenviar("erro")).toBe(true);
  });

  it("não mostra na trilha o que já se resolveu nem status desconhecido", () => {
    for (const status of ["enviado", "nf_cancelada", "substituida", "outro", null, undefined]) {
      expect(nfFilaApareceNaTrilha(status)).toBe(false);
      expect(nfFilaPodeReenviar(status)).toBe(false);
    }
  });
});
