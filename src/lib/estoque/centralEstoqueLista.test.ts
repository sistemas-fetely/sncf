import { describe, expect, it } from "vitest";
import { contagensCentralEstoque, filtrarAlertasAcao, parametrosCentralEstoque } from "./centralEstoqueLista";
import { CARDS_OPERACIONAIS, type AlertaProduto } from "./filaOperacionalEstoque";

const base = { q: "", colecao: [], fase: [], card: "", saldo: false, pagina: 1, tamanho: 20 };

describe("Central paginada", () => {
  it("passa busca, página e tamanho para a relação por SKU sem agrupamento local", () => {
    const p = parametrosCentralEstoque({ ...base, q: "02047", pagina: 3, tamanho: 50 });
    expect([p.relacao, p.busca, p.pagina, p.tamanho]).toEqual(["vw_central_estoque_produto", "02047", 3, 50]);
    expect(p.facetas).toEqual(["colecao", "fase"]);
    expect(p.ordem).toEqual([{ c: "gravidade", dir: "asc" }, { c: "cobertura", dir: "asc" }, { c: "ordem_codigo", dir: "asc" }]);
  });
  it("envia coleções e fases múltiplas e saldo como filtros do banco", () => {
    expect(parametrosCentralEstoque({ ...base, colecao: ["Amour", "Fine Pure"], fase: ["venda", "pre_venda"], saldo: true }).filtros)
      .toEqual([{ c: "colecao", op: "in", v: ["Amour", "Fine Pure"] }, { c: "fase", op: "in", v: ["venda", "pre_venda"] }, { c: "com_saldo", op: "is_true" }]);
  });
  it.each(CARDS_OPERACIONAIS)("filtra %s pelo booleano pronto e mantém seu contador global", card => {
    const p = parametrosCentralEstoque({ ...base, card });
    expect(p.filtros).toEqual([{ c: `card_${card}`, op: "is_true" }]);
    expect(p.agregados?.find(a => a.id === card)).toEqual({ id: card, fn: "count", onde: [{ c: `card_${card}`, op: "is_true" }], ignorar: ["*"] });
  });
  it("todos os contadores e subtítulos ignoram filtros, busca e paginação", () => {
    const p = parametrosCentralEstoque({ ...base, q: "VEL", card: "diverge", colecao: ["Lumier"], pagina: 2 });
    expect(p.agregados).toHaveLength(12);
    expect(p.agregados?.every(a => a.ignorar?.[0] === "*")).toBe(true);
    expect(p.agregados?.slice(-2)).toEqual([
      { id: "custo_parado", fn: "sum", c: "custo_posicao_parado", ignorar: ["*"] },
      { id: "unidades_paradas", fn: "sum", c: "unidades_paradas", ignorar: ["*"] },
    ]);
  });
  it("preserva os oito números de aceite e os cards zerados", () => {
    const valores = { sem_contagem: 535, diverge: 505, a_caminho: 33, zerado_venda: 9, repor: 319, sem_giro: 38, devolucao_alta: 1, acabando: 0 };
    expect(contagensCentralEstoque(valores)).toEqual({ ...valores, retido: 0, parado_xpm: 0 });
  });
  it("ações mantêm todos os alertas do recorte, não apenas os SKUs da página", () => {
    const alerta = { sku: "BOWL", cod_cadastro: "02047", nome_comercial: "Bowl Azul", colecao: "Amour", fase: "venda", saldo_rede: 5 } as AlertaProduto;
    const outro = { ...alerta, sku: "OUTRO", colecao: "Fine Pure" };
    expect(filtrarAlertasAcao([alerta, outro], { q: "bowl", colecao: ["Amour"], fase: ["venda"], saldo: true })).toEqual([alerta]);
    expect(filtrarAlertasAcao([alerta], { q: "não existe", colecao: [], fase: [], saldo: false })).toEqual([]);
  });
});