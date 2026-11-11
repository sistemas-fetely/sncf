import { describe, it, expect, vi } from "vitest";
import { tokenEnvioXpm } from "./sessaoXpm";

describe("sessão para envio XPM", () => {
  const resultado = (token: string, expires_at: number) => ({ data: { session: { access_token: token, expires_at } }, error: null });
  it("renova sessão expirada antes de enviar", async () => {
    const auth = { getSession: vi.fn().mockResolvedValue(resultado("antigo", 1)), refreshSession: vi.fn().mockResolvedValue(resultado("novo", 9999999999)) };
    expect(await tokenEnvioXpm(auth)).toBe("novo");
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });
  it("mantém sessão válida e renova após 401 explícito", async () => {
    const auth = { getSession: vi.fn().mockResolvedValue(resultado("atual", 9999999999)), refreshSession: vi.fn().mockResolvedValue(resultado("novo", 9999999999)) };
    expect(await tokenEnvioXpm(auth)).toBe("atual");
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(await tokenEnvioXpm(auth, true)).toBe("novo");
  });
  it("impede envio sem sessão", async () => {
    const auth = { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), refreshSession: vi.fn() };
    await expect(tokenEnvioXpm(auth)).rejects.toThrow("Sessão expirada");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});