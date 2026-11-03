import { describe, expect, it } from "vitest";
import { filtrarEstoqueVendaFora, resumirVendaFora, type EstoqueVendaFora, type CompetenciaVendaFora } from "./vendaForaContinuo";
const estoque: EstoqueVendaFora[] = [
  { sku: "A", produto: "Vela", ean: "00123", qtd_sncf: 10, valor_custo_sncf: 50, diferenca: 2, qtd_plataforma: 8, qtd_plataforma_loja: 6, qtd_plataforma_transito: 2, data_foto_plataforma: null },
  { sku: "B", produto: "Taça", ean: "00456", qtd_sncf: 3, valor_custo_sncf: 30, diferenca: 0, qtd_plataforma: 3, qtd_plataforma_loja: 3, qtd_plataforma_transito: 0, data_foto_plataforma: null },
];
const competencia = (mes: string, status: string): CompetenciaVendaFora => ({ competencia: mes, unidades: 20, receita_bruta: 876.56, retido_plataforma: 0, mdr: 0, liquido_recebido: 0, aluguel_a_pagar: 219.14, aluguel_status: status, aluguel_vencimento: "2026-11-15", aluguel_alerta: null });
describe("venda fora contínua", () => {
  it("soma estoque real e custo da view", () => { const r = resumirVendaFora(estoque, [], [], "2026-11-03"); expect(r.unidades).toBe(13); expect(r.custo).toBe(80); });
  it("vendido no mês ignora competências anteriores", () => { const r = resumirVendaFora([], [competencia("2026-10-01", "aberto"), competencia("2026-11-01", "aberto")], [], "2026-11-03"); expect(r.mes?.competencia).toBe("2026-11-01"); expect(r.mes?.receita_bruta).toBe(876.56); });
  it("a receber exclui liquidado", () => { expect(resumirVendaFora([], [], [{ situacao: "liquidado", valor_a_liquidar: 100 }, { situacao: "previsto", valor_a_liquidar: 50 }], "2026-11-03").receber).toBe(50); });
  it("aluguel escolhe a competência aberta mais antiga", () => { expect(resumirVendaFora([], [competencia("2026-11-01", "aberto"), competencia("2026-09-01", "pago"), competencia("2026-10-01", "aberto")], [], "2026-11-03").aluguel?.competencia).toBe("2026-10-01"); });
  it("conta somente SKUs divergentes", () => { expect(resumirVendaFora(estoque, [], [], "2026-11-03").divergencias).toBe(1); });
  it("busca EAN preserva zeros e só divergências filtra diferença não nula", () => { expect(filtrarEstoqueVendaFora(estoque, "00123", true).map(r => r.sku)).toEqual(["A"]); expect(filtrarEstoqueVendaFora(estoque, "Taça", true)).toEqual([]); });
});