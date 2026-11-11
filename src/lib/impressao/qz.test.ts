import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connect: vi.fn(), active: vi.fn(), find: vi.fn(), print: vi.fn(), create: vi.fn(() => "config"), invoke: vi.fn() }));
vi.mock("qz-tray", () => ({ default: {
  websocket: { connect: mock.connect, isActive: mock.active },
  security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
  printers: { find: mock.find }, print: mock.print, configs: { create: mock.create },
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
import { escolherImpressora, imprimirZpl, listarImpressoras, qzDisponivel, salvarImpressora, ZPL_TESTE } from "./qz";
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mock.active.mockReturnValue(false); mock.connect.mockResolvedValue(undefined); });
describe("QZ da estação", () => {
  it("indisponibilidade não lança erro e permite fallback", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mock.connect.mockRejectedValue(new Error("Unable to establish connection"));
    expect(await qzDisponivel()).toEqual({ ok: false, erro: "Unable to establish connection" });
    expect(log).toHaveBeenCalledWith("[QZ Tray] Falha de conexão:", "Unable to establish connection");
    log.mockRestore();
  });
  it("compartilha conexão concorrente e reutiliza a ativa", async () => {
    await Promise.all([qzDisponivel(), qzDisponivel()]); expect(mock.connect).toHaveBeenCalledTimes(1);
    mock.active.mockReturnValue(true); expect(await qzDisponivel()).toEqual({ ok: true, erro: null }); expect(mock.connect).toHaveBeenCalledTimes(1);
  });
  it("prefere estação salva, senão a primeira ZDesigner/ZD220", () => {
    const lista = ["A4", "ZDesigner ZD220", "Outra Zebra"];
    expect(escolherImpressora(lista)).toBe("ZDesigner ZD220");
    salvarImpressora("Outra Zebra"); expect(localStorage.getItem("sncf.impressora.zebra")).toBe("Outra Zebra");
    expect(escolherImpressora(lista)).toBe("Outra Zebra");
  });
  it("envia o teste 800×1200 como raw command plain", async () => {
    mock.find.mockResolvedValue(["ZDesigner ZD220"]);
    expect(await listarImpressoras()).toEqual(["ZDesigner ZD220"]);
    await imprimirZpl("ZDesigner ZD220", ZPL_TESTE);
    expect(mock.print).toHaveBeenCalledWith("config", [{ type: "raw", format: "command", flavor: "plain", data: "^XA^PW800^LL1200^FO50,50^A0N,60,60^FDTeste SNCF^FS^XZ" }]);
  });
});