import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { bloqueiaAvancoInstrucao, definirInstrucaoExpedicao, executarInstrucaoRpc, instrucaoMudou } from "./instrucaoExpedicao";

describe("instrução para expedição", () => {
  beforeEach(() => rpc.mockReset());
  it("bloqueia avanço enquanto o banco informa leitura pendente", () => {
    expect(bloqueiaAvancoInstrucao({ instrucao_pendente: true })).toBe(true);
  });
  it("libera avanço após leitura", () => {
    expect(bloqueiaAvancoInstrucao({ instrucao_pendente: false })).toBe(false);
    expect(bloqueiaAvancoInstrucao(null)).toBe(false);
  });
  it("salva instrução nova e texto alterado", () => {
    expect(instrucaoMudou(null, "Embalar para presente")).toBe(true);
    expect(instrucaoMudou("Enviar a caixa", "Enviar apenas a peça")).toBe(true);
  });
  it("texto vazio remove a instrução existente", () => {
    expect(instrucaoMudou("Enviar apenas a peça", "  ")).toBe(true);
  });
  it("não grava instrução inalterada nem ausência de texto", () => {
    expect(instrucaoMudou("Enviar apenas a peça", " Enviar apenas a peça ")).toBe(false);
    expect(instrucaoMudou(null, "")).toBe(false);
  });
  it("remove instrução enviando texto vazio à RPC própria", async () => {
    rpc.mockResolvedValue({ data: { ok: true, mudou: true }, error: null });
    await definirInstrucaoExpedicao("pedido", "   ");
    expect(rpc).toHaveBeenCalledWith("fn_pedido_definir_instrucao_expedicao", { p_pedido_id: "pedido", p_texto: "" });
  });
  it("propaga a mensagem real do banco na leitura", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Este pedido tem instrução para expedição ainda não lida…" } });
    await expect(executarInstrucaoRpc("fn_mesa_sp_ler_instrucao", { p_pedido_id: "pedido" })).rejects.toThrow("Este pedido tem instrução para expedição ainda não lida…");
  });
  it("não confirma sucesso quando o banco retorna ok false", async () => {
    rpc.mockResolvedValue({ data: { ok: false, erro: "Instrução recusada" }, error: null });
    await expect(definirInstrucaoExpedicao("pedido", "Embalar para presente")).rejects.toThrow("Instrução recusada");
  });
});