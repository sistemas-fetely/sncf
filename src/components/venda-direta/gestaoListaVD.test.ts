import { describe, expect, it } from "vitest";
import { fasesGestaoVD, filtrarGestaoVD, lerOrdemGestaoVD, ordenarGestaoVD, pagamentoGestaoVD, porCdGestaoVD, recentesGestaoVD, type PedidoGestaoVD } from "./gestaoListaVD";
import type { VdFase } from "./FunilVD";

const pedido = (dados: Partial<PedidoGestaoVD> = {}): PedidoGestaoVD => ({
  id: "1", id_externo: "VD-0160", recebido_em: "2026-11-23T15:00:00Z", cliente_nome: "Ana", cliente_telefone: "(11) 98888-1234", vendedor_id: "v1", vendedor_nome: "Maria",
  valor_liquido: 100, pagamento: "pix_safra", pagamento_confirmado_em: null, alerta_sem_pagamento: false, codigo_rastreio: "AB123BR", bling_pedido_numero: "222", nf_numero: "874",
  fase: "recebido", fase_rotulo: "Recebido", etapa: "escolher_cd", etapa_rotulo: "Escolher CD", responsavel: "comercial", responsavel_rotulo: "Comercial", acao_equipe: true, proxima_acao: "Escolher CD", etapa_tom: "acao", etapa_detalhe: null, alertas: [], marcos: {}, ...dados,
});
const filtro = { busca: "", filtro: null, vendedora: "todas", pagamento: "todos" };
const devolvidos = new Set<string>();
const fase = (codigo: string, ordem: number, fora_do_fluxo = false): VdFase => ({ codigo, rotulo: codigo, ordem, fora_do_fluxo, descricao: null, icone: null, terminal: codigo === "entregue" || codigo === "cancelado" });

describe("Gestão Site SP com filtros B2C", () => {
  it("CD filtra o conjunto completo, inclusive pedidos fora da primeira página", () => {
    const linhas = Array.from({ length: 40 }, (_, n) => pedido({ id: String(n) }));
    const cds = new Map(linhas.map((l, n) => [l.id, n < 20 ? "SITE-SP" : "XPM-SC"]));
    expect(porCdGestaoVD(linhas, "XPM-SC", cds).map((l) => l.id)).toEqual(linhas.slice(20).map((l) => l.id));
    expect(porCdGestaoVD(linhas, "todos", cds)).toHaveLength(40);
  });
  it("cartões somam valor e contam um alerta por pedido no CD selecionado", () => {
    const linhas = [pedido({ id: "1", alertas: ["a", "b"], valor_liquido: 100 }), pedido({ id: "2", alerta_sem_pagamento: true, valor_liquido: 250 }), pedido({ id: "3", valor_liquido: 700 })];
    const base = porCdGestaoVD(linhas, "SITE-SP", new Map([["1", "SITE-SP"], ["2", "SITE-SP"], ["3", "XPM-SC"]]));
    expect(fasesGestaoVD([fase("recebido", 1)], base)[0]).toMatchObject({ qtd: 2, valor: 350, alertas: 2 });
  });
  it("fluxo segue a ordem da dimensão, fora do fluxo depois e cancelado no final", () => {
    expect(fasesGestaoVD([fase("cancelado", 0), fase("fora_do_fluxo", 0, true), fase("entregue", 30), fase("recebido", 10)], []).map((f) => f.codigo)).toEqual(["recebido", "entregue", "fora_do_fluxo", "cancelado"]);
  });
  it("entregues contam até 30 dias, usando o marco da entrega", () => {
    const agora = Date.parse("2026-11-23T17:37:00Z");
    const linhas = [pedido({ id: "limite", fase: "entregue", marcos: { entregue_em: new Date(agora - 30 * 86400000).toISOString() } }), pedido({ id: "antigo", fase: "entregue", marcos: { entregue_em: new Date(agora - 30 * 86400000 - 1).toISOString() } }), pedido({ id: "sem-data", fase: "entregue" }), pedido({ id: "ativo" })];
    expect(recentesGestaoVD(linhas, agora).map((l) => l.id)).toEqual(["limite", "ativo"]);
  });
  it("Todas esconde entregues e cancelados; cada card mostra apenas sua fase", () => {
    const linhas = [pedido(), pedido({ id: "e", fase: "entregue" }), pedido({ id: "c", fase: "cancelado" })];
    expect(filtrarGestaoVD(linhas, filtro, devolvidos).map((l) => l.id)).toEqual(["1"]);
    expect(filtrarGestaoVD(linhas, { ...filtro, filtro: { tipo: "fase", codigo: "entregue" } }, devolvidos).map((l) => l.id)).toEqual(["e"]);
    expect(filtrarGestaoVD(linhas, { ...filtro, filtro: { tipo: "fase", codigo: "cancelado" } }, devolvidos).map((l) => l.id)).toEqual(["c"]);
  });
  it("busca encontra entregues e cancelados sem ligar switches", () => {
    expect(filtrarGestaoVD([pedido({ fase: "cancelado" }), pedido({ id: "2", fase: "entregue" })], { ...filtro, busca: "VD-0160" }, devolvidos)).toHaveLength(2);
  });
  it.each(["VD-0160", "Ana", "11988881234", "Maria", "222", "874", "AB123BR"])("busca indexa %s", (busca) => {
    expect(filtrarGestaoVD([pedido(), pedido({ id: "outro", id_externo: "VD-0999", cliente_nome: "João", cliente_telefone: "", vendedor_nome: "Pedro", bling_pedido_numero: null, nf_numero: null, codigo_rastreio: null })], { ...filtro, busca }, devolvidos).map((l) => l.id)).toEqual(["1"]);
  });
  it("busca inclui números Bling e NF dos marcos", () => {
    const l = pedido({ marcos: { bling_numero: "991", nf_numero: "883" } });
    expect(filtrarGestaoVD([l], { ...filtro, busca: "991" }, devolvidos)).toHaveLength(1);
    expect(filtrarGestaoVD([l], { ...filtro, busca: "883" }, devolvidos)).toHaveLength(1);
  });
  it("vendedora e pagamento combinam com a fase", () => {
    const linhas = [pedido({ pagamento_confirmado_em: "2026-11-23" }), pedido({ id: "2", vendedor_id: "v2", pagamento_confirmado_em: "2026-11-23" }), pedido({ id: "3" })];
    expect(filtrarGestaoVD(linhas, { ...filtro, vendedora: "v1", pagamento: "pago" }, devolvidos).map((l) => l.id)).toEqual(["1"]);
  });
  it.each(["bonificacao", "conta_corrente_socio"])("%s não se confunde com aguardando", (pagamento) => {
    expect(pagamentoGestaoVD(pedido({ pagamento }), devolvidos)).toBe(pagamento);
    expect(filtrarGestaoVD([pedido({ pagamento })], { ...filtro, pagamento: "aguardando" }, devolvidos)).toHaveLength(0);
  });
  it("devolução concluída prevalece sobre pagamento confirmado", () => {
    expect(pagamentoGestaoVD(pedido({ pagamento_confirmado_em: "2026-11-23" }), new Set(["1"]))).toBe("devolvido");
  });
  it("ordem numérica do pedido e do valor não é lexicográfica", () => {
    const linhas = [pedido({ id: "1", id_externo: "VD-9", valor_liquido: 9 }), pedido({ id: "2", id_externo: "VD-10", valor_liquido: 100 })];
    expect(ordenarGestaoVD(linhas, lerOrdemGestaoVD("pedido:desc"), new Map(), devolvidos).map((l) => l.id)).toEqual(["2", "1"]);
    expect(ordenarGestaoVD(linhas, lerOrdemGestaoVD("valor:asc"), new Map(), devolvidos).map((l) => l.id)).toEqual(["1", "2"]);
    expect(lerOrdemGestaoVD("invalida:asc")).toBeNull();
    expect(lerOrdemGestaoVD("data:errada")).toBeNull();
  });
});