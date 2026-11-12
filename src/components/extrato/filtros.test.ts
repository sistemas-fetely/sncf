import { describe, expect, it } from "vitest";
import { filtrarExtrato, periodoMesAtual } from "./filtros";
import type { MovExtrato } from "./dados";

const linhas = [
  { id: "a", tipo: "credito", valor: 100, dias_em_aberto: 30, data_transacao: "2025-01-01", conta_bancaria_id: "1", descricao: "PIX", contraparte_nome: "Ana", contraparte_documento: "171400", referencia_pedido: "PED-1" },
  { id: "b", tipo: "debito", valor: 20, dias_em_aberto: 31, data_transacao: "2026-11-01", conta_bancaria_id: "2", descricao: "Tarifa" },
] as MovExtrato[];
const filtros = { conta: "todas", busca: "", de: "", ate: "", rapido: "" };
describe("Extrato", () => {
  it("não exclui movimentos antigos quando o período está vazio", () => expect(filtrarExtrato(linhas, filtros)).toHaveLength(2));
  it("mais de 30 dias exclui exatamente 30", () => expect(filtrarExtrato(linhas, { ...filtros, rapido: "antigos" }).map(m => m.id)).toEqual(["b"]));
  it("créditos e débitos são filtros exclusivos", () => {
    expect(filtrarExtrato(linhas, { ...filtros, rapido: "creditos" }).map(m => m.id)).toEqual(["a"]);
    expect(filtrarExtrato(linhas, { ...filtros, rapido: "debitos" }).map(m => m.id)).toEqual(["b"]);
  });
  it("busca documento e referência de pedido", () => {
    expect(filtrarExtrato(linhas, { ...filtros, busca: "171400" }).map(m => m.id)).toEqual(["a"]);
    expect(filtrarExtrato(linhas, { ...filtros, busca: "ped-1" }).map(m => m.id)).toEqual(["a"]);
  });
  it("histórico começa no mês atual", () => expect(periodoMesAtual(new Date(2026, 10, 12))).toEqual({ de: "2026-11-01", ate: "2026-11-30" }));
});