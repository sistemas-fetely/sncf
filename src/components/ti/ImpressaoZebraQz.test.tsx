import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const m = vi.hoisted(() => ({ obter: vi.fn(), disponibilidade: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ hasAnyRole: () => true }) }));
vi.mock("@/lib/impressao/qz", () => ({
  obterCertificadoQz: m.obter, gerarCertificadoQz: vi.fn(), qzDisponivel: m.disponibilidade, listarImpressoras: vi.fn(),
  escolherImpressora: vi.fn(), imprimirZpl: vi.fn(), salvarImpressora: vi.fn(), ZPL_TESTE: "",
}));
import { ImpressaoZebraQz } from "./ImpressaoZebraQz";
beforeEach(() => vi.clearAllMocks());
describe("ImpressaoZebraQz", () => {
  it("falha mantém impressão desabilitada e download disponível", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.obter.mockResolvedValue("PEM");
    m.disponibilidade.mockResolvedValue({ ok: false, erro: "Unable to establish connection" });
    render(<ImpressaoZebraQz />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar QZ" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /Imprimir teste/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Baixar override.crt/ })).toBeEnabled();
    log.mockRestore();
  });
  it("sem certificado no cofre mostra Gerar certificado sem conectar o QZ", async () => {
    m.obter.mockRejectedValue(new Error("Certificado QZ ainda não gerado"));
    render(<ImpressaoZebraQz />);
    expect(await screen.findByRole("button", { name: /Gerar certificado/ })).toBeEnabled();
  });
  it("com certificado, baixar fica habilitado e teste só depois de conectar", async () => {
    m.obter.mockResolvedValue("PEM");
    render(<ImpressaoZebraQz />);
    expect(await screen.findByRole("button", { name: /Baixar override.crt/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Gerar certificado/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Imprimir teste/ })).toBeDisabled();
  });
});
