import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import { chamarEdge } from "./edgePagamento";

beforeEach(() => invoke.mockReset());
it("preserva mensagem real e status 409 do FunctionsHttpError", async () => {
  invoke.mockResolvedValue({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify({ ok: false, erro: "Pedido não está aguardando pagamento (estágio pre_separacao)" }), { status: 409 }) } });
  await expect(chamarEdge("safrapay-link", { pedido_id: "PED-2309" })).rejects.toMatchObject({ status: 409, message: "Pedido não está aguardando pagamento (estágio pre_separacao)" });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("preserva recusa em resposta 2xx", async () => {
  invoke.mockResolvedValue({ data: { ok: false, erro: "Portão já quitado" }, error: null });
  await expect(chamarEdge("safrapay-link", {})).rejects.toThrow("Portão já quitado");
});