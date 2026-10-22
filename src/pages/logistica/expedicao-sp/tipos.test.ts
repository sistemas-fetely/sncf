import { describe, expect, it } from "vitest";
import {
  cepDoEndereco, colunasQuadro, modalSugerido, modoEntregaVendaDireta,
  pedidoEhVendaDireta, rotuloEntregaVendaDireta, tempoParado,
  type ModalRegra,
} from "./tipos";


describe("colunasQuadro", () => {
  it("une comuns por código e põe exclusivas do B2B depois de despacho", () => {
    const e = (canal: string, codigo: string, ordem: number) => ({ canal, codigo, ordem, rotulo: codigo, limite_min: null });
    const cols = colunasQuadro([
      e("B2B", "fila", 10), e("B2B", "aguardando_nf", 50), e("B2B", "nf_emitida", 70),
      e("B2C", "fila", 10), e("B2C", "separacao", 20), e("B2C", "despacho", 60),
    ]).map((c) => c.codigo);
    expect(cols).toEqual(["fila", "separacao", "despacho", "aguardando_nf", "nf_emitida"]);
  });
});

describe("tempoParado", () => {
  it("formata minutos, horas e dias", () => {
    expect(tempoParado(12)).toBe("há 12 min");
    expect(tempoParado(180)).toBe("há 3h");
    expect(tempoParado(2 * 24 * 60)).toBe("há 2d");
  });
});

describe("cepDoEndereco", () => {
  it("aceita as chaves conhecidas e limpa a máscara", () => {
    expect(cepDoEndereco({ cep: "01310-100" })).toBe("01310100");
    expect(cepDoEndereco({ zip: "04538132" })).toBe("04538132");
  });

  it("desiste em paz quando não dá para confiar", () => {
    expect(cepDoEndereco(null)).toBeNull();
    expect(cepDoEndereco({ cep: "123" })).toBeNull();
    expect(cepDoEndereco({ cidade: "São Paulo" })).toBeNull();
  });
});

describe("modalSugerido", () => {
  const regras: ModalRegra[] = [
    { prefixo_cep: null, modal_codigo: "CORREIOS", prioridade: 999 },
    { prefixo_cep: "0", modal_codigo: "LALAMOVE", prioridade: 100 },
    { prefixo_cep: "013", modal_codigo: "MOTOBOY", prioridade: 100 },
  ];

  it("prefixo mais longo vence", () => {
    expect(modalSugerido("01310100", regras)).toBe("MOTOBOY");
  });

  it("prefixo curto ainda pega quando o longo não casa", () => {
    expect(modalSugerido("04538132", regras)).toBe("LALAMOVE");
  });

  it("sem casamento cai na regra default", () => {
    expect(modalSugerido("88000000", regras)).toBe("CORREIOS");
  });

  it("sem CEP cai na regra default", () => {
    expect(modalSugerido(null, regras)).toBe("CORREIOS");
  });

  it("sem nenhuma regra não chuta modal", () => {
    expect(modalSugerido("01310100", [])).toBeNull();
  });
});

describe("venda direta na Mesa SP", () => {
  it("identifica somente o prefixo canônico VD-", () => {
    expect(pedidoEhVendaDireta("VD-0009")).toBe(true);
    expect(pedidoEhVendaDireta("SHOP-0009")).toBe(false);
  });

  it("lê e rotula a entrega escolhida na venda", () => {
    expect(modoEntregaVendaDireta({ modal: "frete_fetely" })).toBe("frete_fetely");
    expect(rotuloEntregaVendaDireta("frete_fetely")).toBe("Frete Fetely");
    expect(rotuloEntregaVendaDireta("retirada")).toBe("Retirada");
  });
});
