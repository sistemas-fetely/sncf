import { describe, expect, it } from "vitest";
import { alertaCoberturaCd } from "./coberturaCd";

const semCd = {
  cd_itens: null,
  cd_itens_cobertos: null,
  cd_faltas: null,
  cd_expedicao_nome: null,
} as const;

describe("alertaCoberturaCd", () => {
  it("não mostra nada quando a view devolve nulas", () => {
    expect(alertaCoberturaCd(semCd)).toBeNull();
  });

  it("não mostra nada quando o CD cobre todos os itens", () => {
    expect(
      alertaCoberturaCd({ ...semCd, cd_itens: 22, cd_itens_cobertos: 22, cd_faltas: [] }),
    ).toBeNull();
  });

  it("conta a falta e monta o tooltip com o CD e uma linha por item", () => {
    const alerta = alertaCoberturaCd({
      cd_itens: 9,
      cd_itens_cobertos: 5,
      cd_expedicao_nome: "Site SP",
      cd_faltas: [
        { sku: "CUPRSD.LG.M.5", pedido: 1, livre_cd: 0 },
        { sku: "PRARASGRAMOS.MO/01859", pedido: 1, livre_cd: 0 },
      ],
    });
    expect(alerta?.texto).toBe("CD não cobre 4/9");
    expect(alerta?.tooltip).toBe(
      "CD Site SP\nCUPRSD.LG.M.5: pede 1, livre no CD 0\nPRARASGRAMOS.MO/01859: pede 1, livre no CD 0",
    );
  });

  it("segue mostrando o alerta sem tooltip quando não há CD nem lista de faltas", () => {
    const alerta = alertaCoberturaCd({
      cd_itens: 3,
      cd_itens_cobertos: 2,
      cd_faltas: null,
      cd_expedicao_nome: null,
    });
    expect(alerta?.texto).toBe("CD não cobre 1/3");
    expect(alerta?.tooltip).toBe("");
  });
});
