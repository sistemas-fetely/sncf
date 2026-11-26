import { expect, test } from "bun:test";
import { portaCronPermite } from "./porta.ts";
test("porta x-cron-secret aceita só diff com execucao_id", () => {
  expect(portaCronPermite({ acao: "diff", execucao_id: "00000000-0000-0000-0000-000000000001" })).toBe(true);
  expect(portaCronPermite({ acao: "diff" })).toBe(false);
  for (const acao of ["aplicar", "automatico", "consultar"]) expect(portaCronPermite({ acao, execucao_id: "x" })).toBe(false);
  expect(portaCronPermite(null)).toBe(false);
});
