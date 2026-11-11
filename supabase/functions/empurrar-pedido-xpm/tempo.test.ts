import { describe, it, expect, vi, afterEach } from "vitest";
import { criarFetchLimitado } from "./tempo";

afterEach(() => vi.useRealTimers());
describe("espera limitada XPM", () => {
  it("retorna corpo e status sem repetir a chamada", async () => {
    const original = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    const resposta = await criarFetchLimitado(Date.now(), original)("https://example.com/Create");
    expect(await resposta.json()).toEqual({ success: true });
    expect(original).toHaveBeenCalledOnce();
  });
  it("aborta quando o orçamento total de 110s acaba e identifica etapa sem repetir Create", async () => {
    vi.useFakeTimers();
    const original = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const chamada = criarFetchLimitado(Date.now(), original)("https://example.com/Create");
    const assertion = expect(chamada).rejects.toThrow("Tempo de espera excedido em /Create");
    await vi.advanceTimersByTimeAsync(110_000);
    await assertion;
    expect(original).toHaveBeenCalledOnce();
  });
  it("não aborta uma etapa de 60s dentro do orçamento total", async () => {
    vi.useFakeTimers();
    const original = vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      setTimeout(() => resolve(new Response('{"success":true}', { status: 200 })), 60_000);
    }));
    const chamada = criarFetchLimitado(Date.now(), original)("https://example.com/Create");
    await vi.advanceTimersByTimeAsync(60_000);
    const resposta = await chamada;
    expect(await resposta.json()).toEqual({ success: true });
    expect(original).toHaveBeenCalledOnce();
  });
  it("não começa etapa após o orçamento total", async () => {
    const original = vi.fn();
    await expect(criarFetchLimitado(Date.now() - 110_001, original)("https://example.com/Create")).rejects.toThrow("antes de /Create");
    expect(original).not.toHaveBeenCalled();
  });
});