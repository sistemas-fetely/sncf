import { describe, it, expect } from "vitest";
import { rotuloOrigemTarefa } from "./rotuloOrigemTarefa";

describe("rotuloOrigemTarefa", () => {
  it("Minhas tarefas", () => expect(rotuloOrigemTarefa("/tarefas/minhas")).toBe("Minhas tarefas"));
  it("projeto aberto", () => expect(rotuloOrigemTarefa("/tarefas/projetos/abc")).toBe("Projeto"));
  it("calendário", () => expect(rotuloOrigemTarefa("/tarefas/calendario")).toBe("Calendário"));
  it("outra tarefa", () => expect(rotuloOrigemTarefa("/tarefas/123e4567")).toBe("Tarefa"));
  it("tela desconhecida cai em Voltar", () => expect(rotuloOrigemTarefa("/financeiro")).toBe("Voltar"));
});
