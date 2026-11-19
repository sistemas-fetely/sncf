import { describe, it, expect } from "vitest";
import { filtrosOrdemFila } from "./filaLista";
const ordenacao = { tipo: "preset", preset: "risco" } as const;
describe("fila paginada", () => {
 it("entrada paga filtra adiantamento positivo", () => expect(filtrosOrdemFila({ ordenacao, situacaoFilter: "com_entrada_paga" }).filtrosLista).toEqual([{ c: "adiantado_vivo", op: "gt", v: 0 }]));
 it("em aberto inclui parcial pago", () => expect(filtrosOrdemFila({ ordenacao, situacaoFilter: "em_aberto" }).filtrosLista).toEqual([{ c: "situacao_financeira", op: "in", v: ["em_aberto", "parcial_pago"] }]));
 it("liberáveis usa o campo preparado", () => expect(filtrosOrdemFila({ ordenacao, liberacaoFilter: "liberado" }).filtrosLista).toEqual([{ c: "liberado_expedicao", op: "is_true" }]));
 it("risco e alerta usam os sinais separados", () => expect(filtrosOrdemFila({ ordenacao, somenteRiscoAlto: true, somenteComAlerta: true }).filtrosLista).toEqual([{ c: "risco_cor", op: "eq", v: "destructive" }, { c: "alerta_severidade", op: "not_null" }]));
 it("entrada paga ordena por adiantamento e recebimento", () => expect(filtrosOrdemFila({ ordenacao: { tipo: "preset", preset: "entrada_paga" } }).ordemLista).toEqual([{ c: "adiantado_vivo", dir: "desc" }, { c: "recebido_em", dir: "desc" }]));
 it("entrega ordena pela previsão pronta", () => expect(filtrosOrdemFila({ ordenacao: { tipo: "coluna", coluna: "entrega", dir: "asc" } }).ordemLista).toEqual([{ c: "previsao_entrega", dir: "asc" }]));
 it("cobrança usa a gravidade do banco", () => expect(filtrosOrdemFila({ ordenacao: { tipo: "coluna", coluna: "cobranca", dir: "desc" } }).ordemLista).toEqual([{ c: "cobranca_gravidade", dir: "desc" }]));
 it("CD e marcação preservam filtros", () => expect(filtrosOrdemFila({ ordenacao, cdFilter: "XPM-SC", marcacaoFilter: "sem" }).filtrosLista).toEqual([{ c: "marcacao", op: "is_null" }, { c: "cd_expedicao_codigo", op: "eq", v: "XPM-SC" }]));
});
