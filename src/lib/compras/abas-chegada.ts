// Produto nasce só pela planilha do catálogo: a antiga sub-aba "cadastro-pi" virou
// redirecionamento para Central do Produto › Conciliação › Novos.
export const DESTINO_NASCIMENTO = "/vendas/produto/conciliacao?aba=novos";

const LEGADAS: Record<string, { aba: string; sub: string }> = {
  "importar-pi": { aba: "importacao-pi", sub: "importar-pi" },
  "de-para": { aba: "ferramentas", sub: "de-para" },
  "rateio-nf": { aba: "ferramentas", sub: "rateio-nf" },
};

/** Link antigo do nascimento por PI → Conciliação › Novos; senão null. */
export function redirecionamentoChegada(params: URLSearchParams): string | null {
  return params.get("aba") === "cadastro-pi" || params.get("aba_pi") === "cadastro-pi" ? DESTINO_NASCIMENTO : null;
}

export function selecaoChegada(params: URLSearchParams) {
  const valor = params.get("aba") ?? "painel";
  const legado = LEGADAS[valor];
  return {
    aba: legado?.aba ?? valor,
    pi: legado?.aba === "importacao-pi" ? legado.sub : params.get("aba_pi") ?? "importar-pi",
    ferramenta: legado?.aba === "ferramentas" ? legado.sub : params.get("aba_ferramentas") ?? "de-para",
  };
}
