import { describe, expect, it } from "vitest";
import { filtrarAChegar, type PedidoAChegar } from "./aChegar";

const pedido = (pedido_id: string, cd_codigo: string | null, canal: string): PedidoAChegar => ({
  pedido_id, cd_codigo, canal, cd_rotulo: null, cliente_nome: null, com_erro: false,
  estagio: null, estagio_rotulo: null, horas_desde_recebido: null, id_externo: null,
  motivo_liberado: null, proxima_acao: null, recebido_em: null, ultimo_evento: null,
  ultimo_evento_em: null, valor_liquido: null,
});
const pedidos = [pedido("1", "SITE-SP", "B2B"), pedido("2", "XPM-SC", "B2C"), pedido("3", null, "interno")];

describe("A chegar — filtros da Mesa", () => {
  it("filtra pelo cd_codigo sem atribuir CD a pedidos sem código", () => {
    expect(filtrarAChegar(pedidos, "SITE-SP", "").map((p) => p.pedido_id)).toEqual(["1"]);
  });
  it("respeita o canal e combina com o CD", () => {
    expect(filtrarAChegar(pedidos, "", "b2c").map((p) => p.pedido_id)).toEqual(["2"]);
    expect(filtrarAChegar(pedidos, "SITE-SP", "b2c")).toEqual([]);
  });
  it("Todos preserva todos os pedidos, inclusive os sem CD", () => {
    expect(filtrarAChegar(pedidos, "", "")).toEqual(pedidos);
  });
});