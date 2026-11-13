import { describe, expect, it } from "vitest";
import { agruparPorFornecedor, contarPrecisa, parseParcelasDias, podeConfirmarSugestao, rotuloPerfil, type NfSemTitulo } from "./perfilPagamento";

const nf = (p: Partial<NfSemTitulo>): NfSemTitulo => ({ nf_id: "1", nf_numero: "1", tipo_documento: null, emissao: null, valor: 0, data_vencimento: null, parceiro_id: null, fornecedor: null, fornecedor_cnpj: null, destino_rotulo: null, plano_codigo: null, plano_nome: null, perfil_forma_codigo: null, perfil_forma_nome: null, perfil_prazo_dias: null, sug_forma_codigo: null, sug_prazo_dias: null, sug_base: null, tem_parcelas: null, motivo: "sem_perfil", created_at: null, ...p });

describe("perfil de pagamento", () => {
  it("aceita parcelas 30/60", () => { expect(parseParcelasDias("30/60")).toEqual({ parcelas: [30, 60], erro: null }); });
  it.each(["30,60", "30 60", " 30 / 60 "])("aceita separadores: %s", (texto) => { expect(parseParcelasDias(texto).parcelas).toEqual([30, 60]); });
  it("vazio mantém pagamento único", () => { expect(parseParcelasDias(" ")).toEqual({ parcelas: [], erro: null }); });
  it("recusa ordem 60/30", () => { expect(parseParcelasDias("60/30").erro).toContain("ordem crescente"); });
  it("recusa repetição 30/30", () => { expect(parseParcelasDias("30/30").erro).toContain("repetir"); });
  it("recusa 30/abc", () => { expect(parseParcelasDias("30/abc").erro).toContain("dias inteiros"); });
  it("recusa dia acima de 365", () => { expect(parseParcelasDias("30/366").erro).toContain("0 a 365"); });
  it("recusa dia negativo", () => { expect(parseParcelasDias("-1/30").parcelas).toBeNull(); });
  it("aceita limites 0 e 365", () => { expect(parseParcelasDias("0/365").parcelas).toEqual([0, 365]); });
  it("limita a 12 parcelas", () => {
    expect(parseParcelasDias(Array.from({ length: 12 }, (_, i) => String(i)).join("/")).parcelas).toHaveLength(12);
    expect(parseParcelasDias(Array.from({ length: 13 }, (_, i) => String(i)).join("/")).erro).toContain("12");
  });
  it("agrupa por fornecedor somando valor, maior primeiro", () => {
    const g = agruparPorFornecedor([nf({ nf_id: "a", parceiro_id: "p1", fornecedor: "A", valor: 10 }), nf({ nf_id: "b", parceiro_id: "p1", valor: 5, sug_forma_codigo: "pix", sug_prazo_dias: 6 }), nf({ nf_id: "c", parceiro_id: "p2", fornecedor: "B", valor: 100, motivo: "pendente" })]);
    expect(g.map((x) => [x.fornecedor, x.notas.length, x.valor])).toEqual([["B", 1, 100], ["A", 2, 15]]);
    expect(g[1].sug_forma_codigo).toBe("pix");
    expect(g[1].precisaPerfil).toBe(true);
    expect(g[0].precisaPerfil).toBe(false);
  });
  it("conta só os motivos que precisam de você", () => {
    expect(contarPrecisa([nf({ motivo: "sem_perfil" }), nf({ motivo: "pendente" }), nf({ motivo: "aguarda_cartao" }), nf({ motivo: "perfil_nao_gera" })])).toBe(2);
  });
  it("rotula perfil e sugestão", () => {
    expect(rotuloPerfil("Boleto", 15)).toBe("Boleto · 15 dias");
    expect(rotuloPerfil("Cartão de crédito", null)).toBe("Cartão de crédito");
    expect(rotuloPerfil("Cartão de crédito", 30, false)).toBe("Cartão de crédito");
    expect(rotuloPerfil(null, 10)).toBe("prazo 10 dias");
    expect(rotuloPerfil(null, null)).toBe("—");
  });
  it("confirmar sugestão exige forma e prazo, salvo forma que não gera título", () => {
    const naoGera = (c: string) => c === "cartao_credito";
    expect(podeConfirmarSugestao(null, 10, naoGera)).toBe(false);
    expect(podeConfirmarSugestao("pix", null, naoGera)).toBe(false);
    expect(podeConfirmarSugestao("pix", 0, naoGera)).toBe(true);
    expect(podeConfirmarSugestao("cartao_credito", null, naoGera)).toBe(true);
  });
});

import { entraNoFiltroPerfil, textoResultadoPerfil, toastPerfilSalvo } from "./perfilPagamento";
describe("perfil salvo nesta sessão", () => {
  const fmt = (v: number) => `R$ ${v}`;
  it("continua no filtro Sem perfil", () => {
    const salvos = new Set(["p1"]);
    expect(entraNoFiltroPerfil({ parceiro_id: "p1", tem_perfil: true }, "sem", salvos)).toBe(true);
    expect(entraNoFiltroPerfil({ parceiro_id: "p2", tem_perfil: true }, "sem", salvos)).toBe(false);
    expect(entraNoFiltroPerfil({ parceiro_id: "p3", tem_perfil: false }, "sem", salvos)).toBe(true);
    expect(entraNoFiltroPerfil({ parceiro_id: "p3", tem_perfil: false }, "com", salvos)).toBe(false);
  });
  it("textos conforme títulos gerados", () => {
    expect(textoResultadoPerfil({ titulos_gerados: 0, valor: 0 }, fmt)).toBe("Vale para as próximas notas deste fornecedor.");
    expect(textoResultadoPerfil({ titulos_gerados: 2, valor: 50 }, fmt)).toBe("2 título(s) gerado(s) agora (R$ 50).");
    expect(toastPerfilSalvo({ titulos_gerados: 0, valor: 0 }, fmt)).toBe("Perfil salvo. Vale para as próximas notas — nenhuma nota pendente hoje.");
    expect(toastPerfilSalvo({ titulos_gerados: 3, valor: 9 }, fmt)).toBe("Perfil salvo · 3 título(s) gerado(s) (R$ 9)");
  });
});
