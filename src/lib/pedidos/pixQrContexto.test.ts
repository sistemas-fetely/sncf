import { describe, expect, it } from "vitest";
import {
  canalEscondeQrPixNovo,
  linhasQrPixVisiveis,
  qrPixJaGerado,
} from "./pixQrContexto";

describe("canalEscondeQrPixNovo", () => {
  it("B2B esconde o QR novo", () => {
    expect(canalEscondeQrPixNovo("B2B")).toBe(true);
  });
  it("compara sem caixa e sem espaços sobrando", () => {
    expect(canalEscondeQrPixNovo("b2b")).toBe(true);
    expect(canalEscondeQrPixNovo("  B2B  ")).toBe(true);
  });
  it("B2C, interno e vazio continuam oferecendo o QR", () => {
    expect(canalEscondeQrPixNovo("B2C")).toBe(false);
    expect(canalEscondeQrPixNovo("interno")).toBe(false);
    expect(canalEscondeQrPixNovo(null)).toBe(false);
    expect(canalEscondeQrPixNovo(undefined)).toBe(false);
    expect(canalEscondeQrPixNovo("")).toBe(false);
  });
});

describe("qrPixJaGerado", () => {
  it("payload EMV + txid na linha contam como QR gerado", () => {
    expect(qrPixJaGerado({ link_pagamento: "000201260014BR.GOV.BCB.PIX", pix_txid: "FET123" })).toBe(true);
  });
  it("imagem ou página pública já registradas contam como QR gerado", () => {
    expect(qrPixJaGerado({ pix_qr_url: "https://pix.example/qr.png" })).toBe(true);
    expect(qrPixJaGerado({ pix_token: "abc123" })).toBe(true);
  });
  it("parcela pendente sem nada gerado não conta", () => {
    expect(qrPixJaGerado({ link_pagamento: null, pix_txid: null, pix_qr_url: null, pix_token: null })).toBe(false);
    expect(qrPixJaGerado({})).toBe(false);
  });
  it("payload sem identificador não é QR utilizável", () => {
    expect(qrPixJaGerado({ link_pagamento: "000201260014BR.GOV.BCB.PIX", pix_txid: null })).toBe(false);
  });
});

describe("linhasQrPixVisiveis", () => {
  const gerada = { id: "a", link_pagamento: "000201", pix_txid: "FET1", pix_qr_url: null, pix_token: null };
  const soImagem = { id: "b", link_pagamento: null, pix_txid: null, pix_qr_url: "https://x/qr.png", pix_token: null };
  const pendente = { id: "c", link_pagamento: null, pix_txid: null, pix_qr_url: null, pix_token: null };

  it("sem esconder, todas as linhas PIX aparecem como hoje", () => {
    expect(linhasQrPixVisiveis([gerada, soImagem, pendente], false).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
  it("escondendo, só ficam as que já têm QR — em modo leitura", () => {
    expect(linhasQrPixVisiveis([gerada, soImagem, pendente], true).map((l) => l.id)).toEqual(["a", "b"]);
  });
  it("parcela nova sem QR nunca aparece no B2B", () => {
    expect(linhasQrPixVisiveis([pendente], true)).toEqual([]);
  });
});
