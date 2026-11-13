import { describe, expect, it } from "vitest";
import { conteudoDataMatrix, dadosDaPrepostagem, montarEtiquetaCorreiosZpl, validadorCep } from "./etiquetaCorreiosZpl";

const pp = {
  codigo_objeto: "AE149958550BR", servico: "SEDEX", cartao: "0080390781",
  payload_envio: {
    codigoServico: "03220", numeroNotaFiscal: "000131", pesoInformado: "725",
    destinatario: { nome: "Julia Cunali melges", telefone: "11999999999", cpfCnpj: "12345678900", endereco: { cep: "01258010", logradouro: "Rua Cayowaá", numero: "2200", complemento: "Apto 91", bairro: "Sumaré", cidade: "São Paulo", uf: "SP" } },
    remetente: { nome: "Fetely", cpfCnpj: "63591078000148", endereco: { cep: "01139000", logradouro: "Avenida Marquês de São Vicente", numero: "576", complemento: "503", bairro: "Várzea da Barra Funda", cidade: "São Paulo", uf: "SP" } },
  },
};

describe("etiqueta Correios ZPL", () => {
  it("validador do CEP completa o múltiplo de 10", () => {
    expect(validadorCep("01258010")).toBe(3); // soma 17
    expect(validadorCep("01139000")).toBe(6); // soma 14
    expect(validadorCep("19000000")).toBe(0);
  });
  it("DataMatrix segue o leiaute de posições fixas", () => {
    const s = conteudoDataMatrix(dadosDaPrepostagem(pp, "9912345678"));
    expect(s.slice(0, 8)).toBe("01258010");
    expect(s.slice(8, 13)).toBe("02200");
    expect(s.slice(13, 21)).toBe("01139000");
    expect(s.slice(21, 26)).toBe("00576");
    expect(s[26]).toBe("3");
    expect(s.slice(27, 29)).toBe("51");
    expect(s.slice(29, 42)).toBe("AE149958550BR");
    expect(s.slice(52, 62)).toBe("0080390781");
    expect(s.slice(62, 67)).toBe("03220");
    expect(s.slice(74, 94)).toBe("Apto 91".padEnd(20));
    expect(s.length).toBe(162);
  });
  it("ZPL 10x15 com rastreio, CEP e sem telefone/documento do cliente", () => {
    const z = montarEtiquetaCorreiosZpl(dadosDaPrepostagem(pp, "9912345678"));
    expect(z).toContain("^PW812");
    expect(z).toContain("^LL1218");
    expect(z).toContain("^BCN,170,N,N,N^FDAE149958550BR");
    expect(z).toContain("^FD01258010^FS");
    expect(z).toContain("SEDEX");
    expect(z).not.toContain("11999999999");
    expect(z).not.toContain("12345678900");
  });
  it("recusa pré-postagem sem código", () => {
    expect(() => dadosDaPrepostagem({ ...pp, codigo_objeto: null }, null)).toThrow();
  });
});
