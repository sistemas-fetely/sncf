import { describe, it, expect } from "vitest";
import { agenciaDoCd, nomeTransportadora, opcoesTransportadora, transportadoraExibida } from "./agenciaTransportadora";

const COR = "c60c4038", BEN = "b9c2", PP = "7364";
const ag = [
  { transportadora_id: COR, centro_codigo: "XPM-SC", agencia_id: BEN, agencia_nome: "Beninca", centro_rotulo: "XPM SC" },
  { transportadora_id: COR, centro_codigo: "SITE-SP", agencia_id: PP, agencia_nome: "Power Post", centro_rotulo: "Site SP" },
];
const lista = [
  { id: COR, razao_social: "EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS", nome_fantasia: "Correios" },
  { id: BEN, razao_social: "BENINCA" }, { id: PP, razao_social: "POWER POST" }, { id: "jad", razao_social: "JADLOG" },
];

describe("Correios uma opção", () => {
  it("esconde as agências e mostra Correios uma vez", () => {
    const o = opcoesTransportadora(lista, ag);
    expect(o.map((t) => t.id)).toEqual([COR, "jad"]);
    expect(nomeTransportadora(o[0], ag)).toBe("Correios");
  });
  it("resolve a agência pelo CD", () => {
    expect(agenciaDoCd(COR, "SITE-SP", "Site SP", ag)?.texto).toBe("Agência: Power Post (Site SP)");
    expect(agenciaDoCd(COR, null, null, ag)?.texto).toBe("Agência: Beninca (XPM-SC)");
  });
  it("avisa quando o CD não tem agência", () => {
    expect(agenciaDoCd(COR, "RJ", "Rio", ag)).toEqual({ tipo: "sem_agencia", texto: "Correios sem agência para o CD Rio" });
  });
  it("pedido antigo gravado com a agência aparece como Correios + agência", () => {
    expect(transportadoraExibida(PP, ag)).toBe(COR);
    expect(agenciaDoCd(PP, "XPM-SC", "XPM SC", ag)?.texto).toBe("Agência: Power Post (Site SP)");
  });
  it("transportadora sem agência não mostra nada", () => {
    expect(agenciaDoCd("jad", "SITE-SP", "Site SP", ag)).toBeNull();
  });
});
