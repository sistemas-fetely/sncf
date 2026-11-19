import { describe, expect, it } from "vitest";
import { modalDespachoMesa, pedidosColetaMesa } from "./coletaMesa";

const modais = [
  { codigo: "POSTAL_DO_CADASTRO", exige_etiqueta_correios: true },
  { codigo: "TRANSPORTADORA", exige_etiqueta_correios: false },
  { codigo: "RETIRADA", exige_etiqueta_correios: false },
  { codigo: "FRETE_FETELY", exige_etiqueta_correios: false },
];
const b2c = { id: "b2c", canal: "B2C", etapa: "despacho" };
const b2b = { id: "b2b", canal: "B2B", etapa: "nf_emitida" };

describe("coleta conjunta da Mesa SP", () => {
  it("PED-2418 usa Correios após embalagem Transportadora e entra na coleta", () => {
    const pedido = { ...b2b, id: "PED-2418", modal_efetivo: "CORREIOS" };
    const modal = modalDespachoMesa(pedido, "TRANSPORTADORA");
    expect(modal).toBe("CORREIOS");
    expect(pedidosColetaMesa([], [pedido], () => modal, [{ codigo: "CORREIOS", exige_etiqueta_correios: true }], new Set())).toEqual([pedido]);
  });
  it("só usa embalagem quando o modal efetivo é nulo", () => {
    expect(modalDespachoMesa({ modal_efetivo: null }, "TRANSPORTADORA")).toBe("TRANSPORTADORA");
    expect(modalDespachoMesa({ modal_efetivo: "RETIRADA" }, "CORREIOS")).toBe("RETIRADA");
    expect(modalDespachoMesa({ modal_efetivo: null }, null)).toBeNull();
  });
  it('bloqueia postagem nas duas fontes e mantém liberados no lote', () => {
    expect(pedidosColetaMesa([{ ...b2c, postagem_bloqueada: true }], [{ ...b2b, postagem_bloqueada: true }], () => 'POSTAL_DO_CADASTRO', modais, new Set())).toEqual([]);
    expect(pedidosColetaMesa([{ ...b2c, postagem_bloqueada: false }], [], () => 'POSTAL_DO_CADASTRO', modais, new Set())).toHaveLength(1);
  });
  it("inclui B2C em despacho e B2B nf_emitida com modalidade postal definida pelo cadastro", () => {
    expect(pedidosColetaMesa([b2c], [b2b], () => "POSTAL_DO_CADASTRO", modais, new Set())).toEqual([b2c, b2b]);
  });
  it.each(["TRANSPORTADORA", "RETIRADA", "FRETE_FETELY", null, "SEM_CADASTRO"])("mantém B2B %s fora da coleta", (modal) => {
    expect(pedidosColetaMesa([b2c], [b2b], () => modal, modais, new Set())).toEqual([b2c]);
  });
  it("exclui pedidos com cancelamento solicitado em ambas as fontes", () => {
    expect(pedidosColetaMesa([b2c], [b2b], () => "POSTAL_DO_CADASTRO", modais, new Set(["b2c", "b2b"]))).toEqual([]);
  });
  it("não duplica IDs nem altera as fontes e etapas do quadro", () => {
    const prontos = [b2c];
    const faturados = [b2b, b2b];
    expect(pedidosColetaMesa(prontos, faturados, () => "POSTAL_DO_CADASTRO", modais, new Set()).map((pedido) => pedido.id)).toEqual(["b2c", "b2b"]);
    expect(prontos).toEqual([b2c]);
    expect(faturados).toEqual([b2b, b2b]);
    expect(b2b.etapa).toBe("nf_emitida");
  });
  it("não inclui outros canais vindos da etapa nf_emitida", () => {
    expect(pedidosColetaMesa([], [{ ...b2b, canal: "interno" }], () => "POSTAL_DO_CADASTRO", modais, new Set())).toEqual([]);
  });
});