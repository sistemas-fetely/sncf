import { describe, expect, it } from "vitest";
import { agruparPorFornecedor, contarPrecisa, podeConfirmarSugestao, rotuloPerfil, type NfSemTitulo } from "./perfilPagamento";

const nf = (p: Partial<NfSemTitulo>): NfSemTitulo => ({ nf_id: "1", nf_numero: "1", tipo_documento: null, emissao: null, valor: 0, data_vencimento: null, parceiro_id: null, fornecedor: null, fornecedor_cnpj: null, destino_rotulo: null, plano_codigo: null, plano_nome: null, perfil_forma_codigo: null, perfil_forma_nome: null, perfil_prazo_dias: null, sug_forma_codigo: null, sug_prazo_dias: null, sug_base: null, tem_parcelas: null, motivo: "sem_perfil", created_at: null, ...p });

describe("perfil de pagamento", () => {
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
