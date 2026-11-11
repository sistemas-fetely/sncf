import { describe, expect, it } from "vitest";
import { alertaDevolucoes, alertaNoPrazo, analisarPeriodo, filtrarUfPeriodo, resumirPeriodo, segundaDoDespacho, type LinhaPeriodo } from "./entregasPeriodo";
const linha = (p: Partial<LinhaPeriodo> = {}): LinhaPeriodo => ({ grao: "pedido", entregue_em: null, dias_entrega: null,
  no_prazo: null, dias_atraso: null, reentregas: null, estado_canonico: null, uf_destino: null, canal: "b2b", data_despacho: "2026-11-11", ...p });
describe("análise de entregas do período", () => {
  it("devoluções acendem alerta somente quando positivas", () => { expect(alertaDevolucoes(0)).toBe(false); expect(alertaDevolucoes(1)).toBe(true); });
  it("conta entregues por data e somente pedidos", () => {
    expect(resumirPeriodo([linha({ entregue_em: "2026-11-12" }), linha({ estado_canonico: "entregue" }), linha({ grao: "cte_orfa", entregue_em: "2026-11-12" })])).toMatchObject({ entregues: 1, remessas: 2 });
  });
  it("média de prazo só das entregues, ignorando nulos", () => {
    expect(resumirPeriodo([linha({ entregue_em: "2026-11-12", dias_entrega: 4 }), linha({ entregue_em: "2026-11-12", dias_entrega: 6.2 }), linha({ dias_entrega: 99 })]).prazoMedio).toBe(5.1);
  });
  it("no prazo usa apenas valores booleanos conhecidos", () => {
    expect(resumirPeriodo([linha({ no_prazo: true }), linha({ no_prazo: false }), linha()])).toMatchObject({ noPrazo: 1, comPrevisao: 2, pctNoPrazo: 50 });
  });
  it("sem previsão retorna nulo, nunca zero", () => expect(resumirPeriodo([linha()]).pctNoPrazo).toBeNull());
  it("atraso médio apenas entregue fora do prazo", () => {
    expect(resumirPeriodo([linha({ entregue_em: "2026-11-12", no_prazo: false, dias_atraso: 3 }), linha({ entregue_em: "2026-11-12", no_prazo: false, dias_atraso: 4 }), linha({ no_prazo: false, dias_atraso: 99 })])).toMatchObject({ atrasoMedio: 3.5, atrasadas: 2 });
  });
  it("sem atrasadas retorna nulo", () => expect(resumirPeriodo([linha()]).atrasoMedio).toBeNull());
  it("soma CT-es de reentrega", () => expect(resumirPeriodo([linha({ reentregas: 3 }), linha({ reentregas: 4 }), linha()]).reentregas).toBe(7));
  it("conta devoluções pelo estado canônico", () => expect(resumirPeriodo([linha({ estado_canonico: "devolucao" }), linha({ estado_canonico: "entregue" })]).devolucoes).toBe(1));
  it("alerta estritamente abaixo de 80%", () => { expect(alertaNoPrazo(79.9)).toBe(true); expect(alertaNoPrazo(80)).toBe(false); expect(alertaNoPrazo(null)).toBe(false); });
  it("segunda a domingo na mesma semana, incluindo virada de ano", () => {
    expect(segundaDoDespacho("2026-11-09")).toBe("2026-11-09"); expect(segundaDoDespacho("2026-11-15")).toBe("2026-11-09"); expect(segundaDoDespacho("2027-01-01")).toBe("2026-12-28");
  });
  it("semana sem previsão mantém ponto ausente", () => expect(analisarPeriodo([linha()]).semanas[0].pctNoPrazo).toBeNull());
  it("grupos ordenados por volume com UF nula preservada e canais separados", () => {
    const a = analisarPeriodo([linha({ uf_destino: "SP" }), linha({ uf_destino: "SP" }), linha({ canal: "b2c" })]);
    expect(a.destinos.map(r => [r.chave, r.remessas])).toEqual([["SP", 2], ["—", 1]]); expect(a.canais).toHaveLength(2);
  });
  it("filtra UF sem confundir nulo com ausência de filtro", () => {
    const linhas = [linha({ uf_destino: "SP" }), linha()]; expect(filtrarUfPeriodo(linhas, "—")).toEqual([linhas[1]]); expect(filtrarUfPeriodo(linhas, null)).toHaveLength(2);
  });
  it("maiores atrasos limita cinco entregues positivos em ordem decrescente", () => {
    const a = analisarPeriodo([...Array.from({ length: 7 }, (_, i) => linha({ entregue_em: "2026-11-12", dias_atraso: i })), linha({ dias_atraso: 100 })]);
    expect(a.atrasos.map(r => r.dias_atraso)).toEqual([6, 5, 4, 3, 2]);
  });
});