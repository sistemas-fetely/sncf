import { describe, it, expect } from "vitest";
import { formatError } from "@/lib/format-error";

// Regressao do Mapa_Erro_Cego (31/07/2026): objeto EXATO do PostgREST
// na violacao de FK vista em producao.
const erroFkReal = {
  code: "23503",
  details:
    'Key (regra_codigo)=(boleto_com _entrada) is not present in table "regras_pagamento_pedido".',
  hint: null,
  message:
    'insert or update on table "condicoes_pagamento" violates foreign key constraint "condicoes_pagamento_regra_codigo_fkey"',
};

describe("formatError", () => {
  it("idioma antigo produzia [object Object]", () => {
    const e: unknown = erroFkReal;
    // eslint-disable-next-line no-restricted-syntax -- uso proposital: este
    // teste PROVA que o idioma antigo produzia "[object Object]".
    const antigo = e instanceof Error ? e.message : String(e);
    expect(antigo).toBe("[object Object]");
  });

  it("formatError entrega a causa real", () => {
    const novo = formatError(erroFkReal);
    expect(novo).not.toBe("[object Object]");
    expect(novo).toContain("foreign key");
    expect(novo).toContain("boleto_com _entrada");
  });

  it("erro 42501 do guard de permissao", () => {
    const out = formatError({
      code: "42501",
      message: "condicao_pagamento_salvar: sem permissão (requer super_admin)",
      details: null,
      hint: null,
    });
    expect(out).toContain("super_admin");
  });

  it("nao quebra com Error, string, null, objeto vazio", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
    expect(formatError("texto")).toBe("texto");
    expect(formatError({})).toBe("Erro desconhecido");
    expect(formatError(null)).toBeTruthy();
  });

  it("humanizeError segue atuando no fim da cadeia", () => {
    expect(formatError({ message: "JWT expired" })).toContain("sessão expirou");
  });
});
