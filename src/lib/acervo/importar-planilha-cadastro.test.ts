import { describe, expect, it } from "vitest";
import { agruparErros, classificarLinha, montarNascimentos, normalizarCod, type LinhaPlanilha } from "./importar-planilha-cadastro";

const l = (linha: number, cod: string | null, celulas: Record<string, unknown>): LinhaPlanilha => ({ linha, cod, celulas, liberar: false });

describe("montarNascimentos", () => {
  it("cod existente na matriz enriquece; sem cod nasce livre", () => {
    const r = montarNascimentos([l(7, "02025", { nome_comercial: "A" }), l(8, null, { nome_comercial: "B" })], "m", new Set(["02025"]));
    expect(r.nascimentos.map((n) => n.linha)).toEqual([8]);
    expect(r.nascimentos[0].pinado).toBe(false);
  });
  it("cod inexistente na matriz nasce pinado com o código no payload", () => {
    const r = montarNascimentos([l(9, "03100", { nome_comercial: "C" })], "", new Set(["02025"]));
    expect(r.nascimentos[0].pinado).toBe(true);
    expect(r.nascimentos[0].payload.cod_cadastro).toBe("03100");
  });
  it("origem vazia = nacional", () => {
    expect(montarNascimentos([l(8, null, { nome_comercial: "B" })], "").nascimentos[0].payload.origem).toBe("nacional");
  });
  it("aceita importado e inner_qtd com vírgula", () => {
    const n = montarNascimentos([l(8, null, { nome_comercial: "B", origem: "Importado", inner_qtd: "12" })], "").nascimentos[0];
    expect(n.payload).toMatchObject({ origem: "importado", inner_qtd: 12 });
  });
  it("origem inválida vira erro", () => {
    expect(montarNascimentos([l(8, null, { nome_comercial: "B", origem: "china" })], "").erros).toHaveLength(1);
  });
});

describe("classificação da prévia (20/10/2026)", () => {
  it("código que o Excel virou número volta a ter 5 casas", () => {
    expect(normalizarCod(1000)).toBe("01000");
    expect(normalizarCod("1000")).toBe("01000");
    expect(normalizarCod("02025")).toBe("02025");
  });
  it("classifica edição, nascimento, pinado e inválida", () => {
    const m = new Set(["01000"]), lv = new Set(["02300"]);
    expect(classificarLinha(l(1, "01000", {}), m, lv)).toBe("edicao");
    expect(classificarLinha(l(2, null, {}), m, lv)).toBe("nascimento");
    expect(classificarLinha(l(3, "02300", {}), m, lv)).toBe("nascimento_pinado");
    expect(classificarLinha(l(4, "09999", {}), m, lv)).toBe("invalida");
  });
  it("linha inválida nunca vira nascimento", () => {
    const r = montarNascimentos([l(4, "09999", { nome_comercial: "X" })], "", new Set(), new Set(["02300"]));
    expect(r.nascimentos).toHaveLength(0);
  });
  it("nascimento sem nome comercial fica bloqueado, sem ir à RPC", () => {
    const r = montarNascimentos([l(5, null, { ncm: "1" })], "");
    expect(r.nascimentos).toHaveLength(0);
    expect(r.sem_nome).toEqual([5]);
  });
  it("erros iguais são agrupados por mensagem", () => {
    const g = agruparErros([{ linha: 73, erros: ["nome_comercial obrigatório"] }, { linha: 74, erros: ["nome_comercial obrigatório"] }]);
    expect(g).toEqual([{ mensagem: "nome_comercial obrigatório", linhas: [73, 74] }]);
  });
});

describe("nome_comercial só para nascimento (20/10/2026)", () => {
  it("em edição é ignorado: não vira mudança nem aviso", async () => {
    const { calcularPrevia } = await import("./importar-planilha-cadastro");
    const r = {
      ok: true, opcoes: {}, campos_bloco2: [],
      ficha: [{ campo: "nome_comercial", bloco: "identidade", dono: "thomer", ordem: 1, rotulo: "Nome comercial (só para nascimento)", importavel_planilha: false, dim_tabela: null, so_nascimento: true }],
      produtos: [{ sku: "S1", cod_cadastro: "01000", valores: { nome_comercial: "Velho" }, sugestoes: {}, fase_atual: null, proxima_fase: null, pendencias: [] }],
    };
    const p = calcularPrevia([l(5, "01000", { nome_comercial: "Novo" })], r);
    expect(p.itens[0].mudancas).toHaveLength(0);
    expect(p.avisos).toHaveLength(0);
  });
  it("em nascimento vai no payload", () => {
    expect(montarNascimentos([l(8, null, { nome_comercial: "Vela X" })], "").nascimentos[0].payload.nome_comercial).toBe("Vela X");
  });
});
