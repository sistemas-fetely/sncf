import { describe, expect, it } from "vitest";
import { argsTrocaCdVD, exigeTransportadoraVD, podeConfirmarTrocaCdVD, podeTrocarCdVD, type PedidoTrocaCdVD } from "./trocarCdVD";

const pedido: PedidoTrocaCdVD = { id: "pedido", id_externo: "VD-0092", estagio: "pre_faturamento", nf_numero: null, cancelado_em: null, modal: "balcao" };
describe("Trocar CD da Venda Direta", () => {
  it.each(["aguardando_pagamento", "cobranca", "pre_faturamento"])("permite antes da NF em %s", (estagio) => expect(podeTrocarCdVD({ ...pedido, estagio })).toBe(true));
  it.each(["faturado", "pre_separacao", "em_separacao", "cancelado", null])("não permite em %s", (estagio) => expect(podeTrocarCdVD({ ...pedido, estagio })).toBe(false));
  it("recusa qualquer NF não nula", () => expect(podeTrocarCdVD({ ...pedido, nf_numero: "000141" })).toBe(false));
  it("recusa cancelado", () => expect(podeTrocarCdVD({ ...pedido, cancelado_em: "2026-11-17" })).toBe(false));
  it.each(["retirada", "balcao"])("exige transportadora para %s", (modal) => {
    expect(exigeTransportadoraVD(modal)).toBe(true);
    expect(podeConfirmarTrocaCdVD("XPM-SC", "sai de SC", modal, "")).toBe(false);
    expect(podeConfirmarTrocaCdVD("XPM-SC", "sai de SC", modal, "braspress")).toBe(true);
  });
  it("não exige transportadora para outros modais", () => expect(podeConfirmarTrocaCdVD("XPM-SC", "abc", "sedex", "")).toBe(true));
  it("exige CD e três caracteres de motivo sem espaços", () => {
    expect(podeConfirmarTrocaCdVD("", "abc", "sedex", "")).toBe(false);
    expect(podeConfirmarTrocaCdVD("XPM-SC", " ab ", "sedex", "")).toBe(false);
    expect(podeConfirmarTrocaCdVD("XPM-SC", " abc ", "sedex", "")).toBe(true);
  });
  it("envia apenas os quatro parâmetros, sem frete_tipo", () => {
    expect(argsTrocaCdVD("pedido", "XPM-SC", " motivo ", "braspress")).toEqual({ p_pedido_id: "pedido", p_centro_codigo: "XPM-SC", p_motivo: "motivo", p_transportadora_id: "braspress" });
    expect(argsTrocaCdVD("pedido", "XPM-SC", "motivo", "").p_transportadora_id).toBeNull();
  });
});