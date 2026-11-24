import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AtualizacaoFila } from "./AtualizacaoFila";

afterEach(cleanup);

describe("atualização da fila com dados anteriores", () => {
  it("sinaliza a espera pela nova resposta e remove o aviso quando ela chega", () => {
    const { rerender } = render(<AtualizacaoFila isPlaceholderData={true} />);
    expect(screen.getByRole("status")).toBeVisible();
    rerender(<AtualizacaoFila isPlaceholderData={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("não sinaliza refetch de fundo sem placeholder", () => {
    render(<AtualizacaoFila isPlaceholderData={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});