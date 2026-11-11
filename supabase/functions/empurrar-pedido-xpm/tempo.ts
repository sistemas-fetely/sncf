/** Limita rede e leitura do corpo; nunca repete uma escrita após timeout. */
export function criarFetchLimitado(inicio: number, original: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const etapa = new URL(url).pathname;
    const restante = 110_000 - (Date.now() - inicio);
    if (restante <= 0) throw new Error(`Tempo de envio esgotado antes de ${etapa}. Confira a expedição na XPM antes de tentar novamente.`);
    const controller = new AbortController();
    const anterior = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abortar = () => controller.abort();
    anterior?.addEventListener("abort", abortar, { once: true });
    if (anterior?.aborted) abortar();
    const timer = setTimeout(abortar, restante);
    console.info(`[empurrar-pedido-xpm] início ${etapa}`);
    try {
      const resposta = await original(input, { ...init, signal: controller.signal });
      const corpo = await resposta.arrayBuffer();
      console.info(`[empurrar-pedido-xpm] fim ${etapa} HTTP ${resposta.status} +${Date.now() - inicio}ms`);
      return new Response(corpo.byteLength ? corpo : null, {
        status: resposta.status, statusText: resposta.statusText, headers: resposta.headers,
      });
    } catch (e) {
      if (controller.signal.aborted && !anterior?.aborted) {
        throw new Error(`Tempo de espera excedido em ${etapa}. Confira a expedição na XPM antes de tentar novamente.`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      anterior?.removeEventListener("abort", abortar);
    }
  };
}