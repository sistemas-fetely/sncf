import { describe, expect, it } from "vitest";
import { ehTransferenciaMesa, saidaSiteSp, finalidadeSaidaSite, estagioTiMesa, mensagemEntregaTi } from "./transferenciaInterna";
import { colunasQuadro } from "./tipos";
describe("TI na Mesa SP", () => {
  it("interno não altera canais de venda", () => { expect(ehTransferenciaMesa("interno")).toBe(true); expect(ehTransferenciaMesa("B2C")).toBe(false); expect(ehTransferenciaMesa("B2B")).toBe(false); });
  it("só saídas Site SP seguem para Mesa", () => { expect(saidaSiteSp("SITE-SP")).toBe(true); expect(saidaSiteSp("FET-SP-SR")).toBe(false); expect(saidaSiteSp("EVENTO-SP")).toBe(false); });
  it("finalidades Site SP excluem reposição", () => { for (const c of ["mostruario_showroom", "venda_fora", "outros"]) expect(finalidadeSaidaSite(c)).toBe(true); expect(finalidadeSaidaSite("reposicao_site_sp")).toBe(false); });
  it("entrada na fila não é entrega", () => { for (const estagio of ["pre_separacao", "em_separacao"]) expect(estagioTiMesa({ canal: "interno", estagio, recebido_em: "2026-11-13" })).toBe("Mesa SP"); expect(estagioTiMesa({ canal: "interno", estagio: "entregue", recebido_em: "2026-11-13" })).toBe("Entregue"); expect(estagioTiMesa({ canal: "B2B", estagio: "pre_separacao", recebido_em: null })).toBe(null); });
  it("entrega usa coluna despacho sem criar embalagem", () => { const cols = colunasQuadro([{ canal: "interno", codigo: "entrega", rotulo: "Entrega", ordem: 4, limite_min: null, coluna_quadro: "despacho", ordem_quadro: 6 }]); expect(cols).toEqual([{ codigo: "despacho", rotulo: "Entrega", etapas: ["entrega"] }]); });
  it("quantidades da entrega vêm da resposta da RPC", () => { expect(mensagemEntregaTi({ ok: true, id_externo: "TI-0013", origem: "Site SP", destino: "Evento", itens: 158, pecas: 418 })).toContain("158 SKUs / 418 kits"); });
});