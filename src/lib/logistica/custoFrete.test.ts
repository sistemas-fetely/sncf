import { describe, expect, it } from "vitest";
import { acimaDoTeto, analisarCustoFrete, brlComSinal, percentualComSinal, totaisCustoFrete, type DocumentoCusto } from "./custoFrete";
const doc = (p: Partial<DocumentoCusto> = {}): DocumentoCusto => ({ valor_doc: null, valor_fatura: null, frete_cotacao: null, frete_cliente: null, natureza: "Normal", desvio_cotacao_alerta: null, ...p });
describe("gestão do custo do frete", () => {
  it("cobrado prioriza fatura inclusive zero e soma todos os documentos", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 100, valor_fatura: 80 }), doc({ valor_doc: 50, valor_fatura: 0 }), doc({ valor_doc: 20 })])).toMatchObject({ cobrado: 100, documentos: 3 });
  });
  it("cotado soma cotações não nulas contando zero", () => {
    expect(analisarCustoFrete([doc({ frete_cotacao: 100 }), doc({ frete_cotacao: 0 }), doc()])).toMatchObject({ cotacao: 100, comCotacao: 2 });
  });
  it("delta justo inclui somente cotação estritamente positiva", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 120, frete_cotacao: 100 }), doc({ valor_doc: 800 }), doc({ valor_doc: 700, frete_cotacao: 0 }), doc({ valor_doc: 900, frete_cotacao: -1 })])).toMatchObject({ delta: 20, deltaPct: 20, alertaDelta: true });
  });
  it("sem cotação positiva não inventa delta", () => {
    expect(analisarCustoFrete([doc(), doc({ frete_cotacao: 0 })])).toMatchObject({ delta: null, deltaPct: null, alertaDelta: false });
  });
  it("delta percentual pondera somas, não médias de percentuais", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 110, frete_cotacao: 100 }), doc({ valor_doc: 990, frete_cotacao: 900 })]).deltaPct).toBe(10);
  });
  it("delta negativo ou zero não acende alerta", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 20, frete_cotacao: 100 })])).toMatchObject({ delta: -80, alertaDelta: false });
    expect(analisarCustoFrete([doc({ valor_doc: 100, frete_cotacao: 100 })]).alertaDelta).toBe(false);
  });
  it("cliente soma não nulos, conta pagamentos conhecidos e frete grátis", () => {
    expect(analisarCustoFrete([doc({ frete_cliente: 80 }), doc({ frete_cliente: 0 }), doc()])).toMatchObject({ cliente: 80, pedidos: 2, gratis: 1 });
  });
  it("resultado inclui custos de reentrega e devolução", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 100, frete_cliente: 120 }), doc({ valor_doc: 30, natureza: "Reentrega" }), doc({ valor_doc: 20, natureza: "Devolução" })])).toMatchObject({ resultado: -30, alertaResultado: true });
    expect(analisarCustoFrete([doc({ valor_doc: 100, frete_cliente: 120 })]).alertaResultado).toBe(false);
  });
  it("extra só exclui natureza Normal, usa a precedência da fatura", () => {
    expect(analisarCustoFrete([doc({ valor_doc: 100 }), doc({ valor_doc: 40, valor_fatura: 30, natureza: "Reentrega" }), doc({ valor_doc: 20, natureza: "Devolução" }), doc({ valor_doc: 10, natureza: "Outros" }), doc({ valor_doc: 5, natureza: null })])).toMatchObject({ custoExtra: 65, extras: 4 });
  });
  it("filtro acima do teto usa só a flag do banco", () => {
    expect(acimaDoTeto(doc({ desvio_cotacao_alerta: true }))).toBe(true);
    expect(acimaDoTeto(doc({ desvio_cotacao_alerta: false }))).toBe(false);
    expect(acimaDoTeto(doc())).toBe(false);
  });
  it("totais trabalham sobre a lista filtrada em centavos", () => {
    const linhas = [doc({ frete_cotacao: 0.1, frete_cliente: 0.2, valor_doc: 0.1 }), doc({ frete_cotacao: 0.2, frete_cliente: 0.1, valor_fatura: 0.2 })];
    expect(totaisCustoFrete(linhas)).toEqual({ cotacao: 0.3, cliente: 0.3, cobrado: 0.3 });
    expect(totaisCustoFrete(linhas.slice(0, 1))).toEqual({ cotacao: 0.1, cliente: 0.2, cobrado: 0.1 });
  });
  it("formata BRL com sinal e menos matemático", () => {
    expect(brlComSinal(1234.56).replace(/\s/g, " ")).toBe("+R$ 1.234,56");
    expect(brlComSinal(-80).replace(/\s/g, " ")).toBe("−R$ 80,00");
    expect(brlComSinal(null)).toBe("—"); expect(brlComSinal(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
  it("percentuais têm sinal, vírgula e uma casa", () => {
    expect(percentualComSinal(8.2)).toBe("+8,2%"); expect(percentualComSinal(-13.5)).toBe("−13,5%"); expect(percentualComSinal(0)).toBe("0,0%");
  });
});