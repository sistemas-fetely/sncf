import { describe, it, expect } from "vitest";
import { filtrarGrupos, faixaConfianca, periodo, contasFolha, type GrupoMesa } from "./mesaClassificacao";
const g = (p: Partial<GrupoMesa>): GrupoMesa => ({ porta: "nf", chave: "k", rotulo: "X", itens: 1, valor: 10, de: null, ate: null, itens_sem_plano: 0, valor_sem_plano: 0, itens_sem_centro: 0, destinos: null, pista: null, grupo_id: null, sugestao_status: null, sugestao_origem: null, sug_plano_contas_id: null, sug_plano_codigo: null, sug_plano_nome: null, sug_centro_custo_id: null, sug_centro_codigo: null, sug_centro_nome: null, sug_destino_codigo: null, sug_destino_rotulo: null, sug_motivo: null, sug_confianca: null, regra_automatica: null, ...p });
const F = { porta: "todas", pendencia: "sem_plano" as const, confianca: "todas" as const, busca: "" };
describe("mesa", () => {
  it("confiança: 75 alta, 74 média, 49 baixa", () => { expect(faixaConfianca(75)).toBe("alta"); expect(faixaConfianca(74)).toBe("media"); expect(faixaConfianca(49)).toBe("baixa"); });
  it("sem plano ordena por valor_sem_plano desc", () => {
    const r = filtrarGrupos([g({ chave: "a", itens_sem_plano: 1, valor_sem_plano: 5 }), g({ chave: "b", itens_sem_plano: 1, valor_sem_plano: 9 }), g({ chave: "c" })], F);
    expect(r.map((x) => x.chave)).toEqual(["b", "a"]);
  });
  it("sem centro exige zero sem plano", () => {
    const r = filtrarGrupos([g({ chave: "a", itens_sem_plano: 1, itens_sem_centro: 1 }), g({ chave: "b", itens_sem_centro: 2 })], { ...F, pendencia: "sem_centro" });
    expect(r.map((x) => x.chave)).toEqual(["b"]);
  });
  it("período", () => { expect(periodo("2026-01-05", "2026-01-30")).toBe("jan/26"); expect(periodo("2026-01-05", "2026-03-01")).toBe("jan/26 – mar/26"); });
  it("só folhas", () => expect(contasFolha([{ id: "1", parent_id: null, codigo: "1" }, { id: "2", parent_id: "1", codigo: "1.1" }]).map((c) => c.id)).toEqual(["2"]));
});
