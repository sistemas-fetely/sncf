import { describe, expect, it } from "vitest";
import { adaptarProdutoCentral, agrupar, contarFila, filtrar, type LinhaCentral } from "./centralEstoque";

const base = (o: Partial<LinhaCentral>): LinhaCentral => ({
  cod_cadastro: null, sku: "A", nome_comercial: null, cor_nome: null, colecao: null, fase: null, centro: "XPM-SC",
  centro_rotulo: "XPM SC", centro_ordem: 10, papel: "mae", papel_rotulo: null, conta_na_rede: true, regua: null,
  compoe_falta: null, contabil: 0, vendavel: 0, bloqueado: 0, reservado: 0, disponivel: 0, a_caminho: 0, real_centro: null,
  contagem_em: null, dias_desde_contagem: null, furo: null, demanda_dia: 0, piso_un: null, piso_dias: null, regras: null,
  retencoes: null, cobertura_dias: null, status: "ok", diverge_real: false, ...o,
});

describe("central de estoque", () => {
  const linhas = [
    base({ sku: "OK", disponivel: 10, cobertura_dias: 50 }),
    base({ sku: "ACA", status: "acabando", disponivel: 3, cobertura_dias: 2 }),
    base({ sku: "ZER", status: "zerado", demanda_dia: 1 }),
    base({ sku: "RET", status: "retido", disponivel: 5 }),
    base({ sku: "OK", centro: "CONSIG", papel: "terceiro", conta_na_rede: false, disponivel: 7 }),
    base({ sku: "OK", centro: "FET-SP-SR", papel: "complemento", centro_ordem: 20, disponivel: 2 }),
  ];
  const { produtos, colunas } = agrupar(linhas);

  it("ordena retido, zerado com venda, acabando, ok", () => {
    expect(produtos.map((p) => p.sku)).toEqual(["RET", "ZER", "ACA", "OK"]);
  });
  it("rede só soma centros que contam na rede; terceiros à parte", () => {
    const ok = produtos.find((p) => p.sku === "OK");
    if (!ok) throw new Error("Produto OK ausente.");
    expect(ok.rede).toBe(12);
    expect(ok.terceirosDisp).toBe(7);
  });
  it("colunas só mãe/avançado/complemento, por ordem", () => {
    expect(colunas.map((c) => c.codigo)).toEqual(["XPM-SC", "FET-SP-SR"]);
  });
  it("sem contagem ignora a mãe", () => {
    expect(contarFila(produtos).sem_contagem).toBe(1);
    expect(filtrar(produtos, { q: "", colecao: "", fase: "", card: "sem_contagem", comSaldo: false }).map((p) => p.sku)).toEqual(["OK"]);
  });
  it("sem contagem só conta CD com disponível > 0", () => {
    const r = agrupar([base({ sku: "Z", centro: "FET-SP-SR", papel: "complemento", disponivel: 0 })]);
    expect(contarFila(r.produtos).sem_contagem).toBe(0);
  });

  it("adapta centros e terceiros sem recalcular gravidade, cobertura ou totais do banco", () => {
    const centros = {
      "XPM-SC": base({ disponivel: 100, status: "retido" }),
      "SITE-SP": base({ centro: "SITE-SP", papel: "avancado", disponivel: 20 }),
      "FET-SP-SR": base({ centro: "FET-SP-SR", papel: "complemento", disponivel: 30 }),
      "OUTRO": base({ centro: "OUTRO", papel: "outro", disponivel: 50 }),
    };
    const terceiros = [base({ centro: "CONSIG", papel: "terceiro", disponivel: 99 })];
    const p = adaptarProdutoCentral({ sku: "A", cod_cadastro: "02047", nome: "Bowl", cor: "Azul", colecao: "Amour", fase: "venda",
      centros, terceiros, gravidade: 3, cobertura: 324.8, rede: 443, terceiros_disp: 9 });
    expect(p.centros).toBe(centros);
    expect(p.principais.map(l => l.centro)).toEqual(["XPM-SC", "SITE-SP", "FET-SP-SR"]);
    expect(p.terceiros).toBe(terceiros);
    expect({ gravidade: p.gravidade, cobertura: p.cobertura, rede: p.rede, terceiros: p.terceirosDisp }).toEqual({ gravidade: 3, cobertura: 324.8, rede: 443, terceiros: 9 });
    expect([p.cod_cadastro, p.nome, p.cor, p.colecao, p.fase]).toEqual(["02047", "Bowl", "Azul", "Amour", "venda"]);
  });
});
