import { describe, expect, it } from "vitest";
import {
  EVENTO_CONFERENCIA_DIVERGENCIA, EVENTO_CONFERENCIA_OK, EVENTO_DESPACHADO,
  EVENTO_EMBALADO, EVENTO_SEPARACAO_INICIADA,
  cepDoEndereco, estacaoBase, modalSugerido,
  type EventoMesa, type ModalRegra,
} from "./tipos";

/** Fabrica um evento com só o que a derivação lê. */
function ev(tipo: string, criado_em: string): EventoMesa {
  return { id: `${tipo}-${criado_em}`, pedido_id: "p1", tipo_evento: tipo, descricao: null, criado_em, metadata: null };
}

describe("estacaoBase", () => {
  it("pré-separação é fila, qualquer que seja a trilha", () => {
    expect(estacaoBase("pre_separacao", [ev(EVENTO_EMBALADO, "2026-01-01T10:00:00Z")])).toBe("fila");
  });

  it("vale o ÚLTIMO evento mesa_*, não o primeiro", () => {
    const eventos = [
      ev(EVENTO_SEPARACAO_INICIADA, "2026-01-01T10:00:00Z"),
      ev(EVENTO_CONFERENCIA_OK, "2026-01-01T10:30:00Z"),
      ev(EVENTO_EMBALADO, "2026-01-01T11:00:00Z"),
    ];
    expect(estacaoBase("em_separacao", eventos)).toBe("despacho");
  });

  it("divergência devolve para separação (retrabalho), sem mexer no estágio", () => {
    const eventos = [
      ev(EVENTO_SEPARACAO_INICIADA, "2026-01-01T10:00:00Z"),
      ev(EVENTO_CONFERENCIA_DIVERGENCIA, "2026-01-01T10:30:00Z"),
    ];
    expect(estacaoBase("em_separacao", eventos)).toBe("separacao");
  });

  it("despachado sai da mesa", () => {
    expect(estacaoBase("em_transporte", [ev(EVENTO_DESPACHADO, "2026-01-01T12:00:00Z")])).toBe("despachado");
  });

  it("em separação sem nenhum evento da mesa aparece em separação, não some", () => {
    expect(estacaoBase("em_separacao", [])).toBe("separacao");
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
