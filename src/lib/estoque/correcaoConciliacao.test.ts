import { describe, it, expect } from "vitest";
import { decidirCorrecao, type LinhaCorrecao } from "./correcaoConciliacao";

const base: LinhaCorrecao = { fonte_real: "contagem", contagem_vencida: false, real: 0, fiscal: 29, correcao: "contagem" };

describe("decidirCorrecao", () => {
  it("contagem válida com diferença (01888: 0 × 29) oferece Aplicar contagem ao super admin", () => {
    expect(decidirCorrecao(base, true)).toBe("aplicar_contagem");
  });
  it("sem super admin não oferece o checkbox nem o link de contar", () => {
    expect(decidirCorrecao(base, false)).toBe("aplicar_contagem_sem_permissao");
  });
  it("contagem válida sem diferença não oferece aplicar", () => {
    expect(decidirCorrecao({ ...base, real: 29, correcao: null }, true)).toBe("nenhuma");
  });
  it("contagem vencida leva a Contar no Inventário", () => {
    expect(decidirCorrecao({ ...base, contagem_vencida: true }, true)).toBe("contar_inventario");
  });
  it("sem contagem leva a Contar no Inventário", () => {
    expect(decidirCorrecao({ ...base, fonte_real: "sem_contagem", real: null }, true)).toBe("contar_inventario");
  });
  it("real nulo não oferece aplicar", () => {
    expect(decidirCorrecao({ ...base, real: null, correcao: null }, true)).toBe("nenhuma");
  });
  it("armazém continua com ajustar pelo armazém", () => {
    expect(decidirCorrecao({ ...base, fonte_real: "armazem", correcao: "ajustar_armazem" }, true)).toBe("ajustar_armazem");
  });
});
