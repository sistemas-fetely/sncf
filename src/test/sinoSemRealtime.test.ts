import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PERFORMANCE (27/11/2026): o sino não pode abrir canal Realtime.
 *
 * `postgres_changes` custa leitura contínua do log de alterações no banco.
 * O aviso chega pela rebusca periódica (60s) e pelo retorno à aba.
 */
const FONTE = readFileSync(
  resolve(process.cwd(), "src/components/shared/SinoNotificacoes.tsx"),
  "utf8",
);

describe("sino sem Realtime", () => {
  it("não assina postgres_changes nem abre canal", () => {
    expect(FONTE).not.toContain("postgres_changes");
    expect(FONTE).not.toContain(".channel(");
    expect(FONTE).not.toContain("removeChannel");
  });

  it("rebusca a cada 60s e ao voltar para a aba", () => {
    expect(FONTE).toContain("refetchInterval: 60_000");
    expect(FONTE).toContain("refetchOnWindowFocus: true");
    expect(FONTE).not.toContain("refetchInterval: 300_000");
  });
});
