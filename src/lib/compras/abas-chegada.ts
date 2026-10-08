const LEGADAS: Record<string, { aba: string; sub: string }> = {
  "importar-pi": { aba: "importacao-pi", sub: "importar-pi" },
  "cadastro-pi": { aba: "importacao-pi", sub: "cadastro-pi" },
  "de-para": { aba: "ferramentas", sub: "de-para" },
  "rateio-nf": { aba: "ferramentas", sub: "rateio-nf" },
};

export function selecaoChegada(params: URLSearchParams) {
  const valor = params.get("aba") ?? "painel";
  const legado = LEGADAS[valor];
  return {
    aba: legado?.aba ?? valor,
    pi: legado?.aba === "importacao-pi" ? legado.sub : params.get("aba_pi") ?? "importar-pi",
    ferramenta: legado?.aba === "ferramentas" ? legado.sub : params.get("aba_ferramentas") ?? "de-para",
  };
}