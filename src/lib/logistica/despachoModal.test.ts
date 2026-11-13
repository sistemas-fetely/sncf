import { describe, expect, it } from "vitest";
import { modalDoCadastro, requisitosDespachoModal } from "./despachoModal";

const modal = { exige_etiqueta_correios: false, sem_despacho: false, tem_rastreio_automatico: false };
describe("despacho por capacidades do cadastro", () => {
  for (const codigo of ["ML_PONTO_COLETA", "ML_COLETA_CD", "SHOPEE_AGENCIA", "SHOPEE_COLETA_CD"]) {
    it(`${codigo} exige executor mas não referência`, () => {
      const executores = [{ codigo, exige_referencia: false }];
      expect(requisitosDespachoModal(modal, executores, "").executorValido).toBe(false);
      const regra = requisitosDespachoModal(modal, executores, codigo);
      expect(regra.usaExecutor).toBe(true);
      expect(regra.executorValido).toBe(true);
      expect(regra.exigeReferencia).toBe(false);
    });
  }
  it("executor com exige_referencia pede referência", () => {
    expect(requisitosDespachoModal(modal, [{ codigo: "NOVO", exige_referencia: true }], "NOVO").exigeReferencia).toBe(true);
  });
  it("modal sem executor nem etiqueta despacha direto", () => {
    const regra = requisitosDespachoModal(modal, [], "");
    expect(regra.usaExecutor).toBe(false);
    expect(regra.executorValido).toBe(true);
    expect(regra.exigeReferencia).toBe(false);
  });
  it("lote só segue a capacidade do modal e não omite executores", () => {
    expect(requisitosDespachoModal({ ...modal, tem_rastreio_automatico: true }, [], "").permiteLote).toBe(true);
    expect(requisitosDespachoModal({ ...modal, tem_rastreio_automatico: true }, [{ codigo: "NOVO", exige_referencia: false }], "NOVO").permiteLote).toBe(false);
    expect(requisitosDespachoModal(modal, [], "").permiteLote).toBe(false);
  });
});

describe("modalDoCadastro", () => {
  const correios = { codigo: "CORREIOS", nome: "Correios", exige_etiqueta_correios: true };
  const retirada = { codigo: "RETIRADA", nome: "Retirada no local", exige_etiqueta_correios: false };
  const modais = [correios, retirada];

  it("resolve pelo nome devolvido por fn_mesa_sp_dados_impressao", () => {
    expect(modalDoCadastro(modais, "Correios")).toBe(correios);
  });
  it("resolve pelo código da embalagem", () => {
    expect(modalDoCadastro(modais, "CORREIOS")).toBe(correios);
  });
  it("ignora maiúsculas e espaços", () => {
    expect(modalDoCadastro(modais, " correios ")).toBe(correios);
  });
  it("código desconhecido devolve null", () => {
    expect(modalDoCadastro(modais, "INEXISTENTE")).toBeNull();
    expect(modalDoCadastro(modais, null, undefined, "")).toBeNull();
  });
  it("embalagem (código) tem precedência sobre dados (nome)", () => {
    expect(modalDoCadastro(modais, "RETIRADA", "Correios")).toBe(retirada);
    expect(modalDoCadastro(modais, null, "Correios")).toBe(correios);
  });
  it("exige_etiqueta_correios do modal resolvido", () => {
    expect(modalDoCadastro(modais, "CORREIOS", "Correios")?.exige_etiqueta_correios).toBe(true);
  });
});