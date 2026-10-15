// Linguagem do operador para os modos do perfil da transportadora (dimensão transportadora_perfil).
export const ROTULO_MODO_CUSTO: Record<string, string> = {
  fatura_planilha: "fatura importada",
  api_cte: "API da transportadora",
  lancamento_postagem: "fatura dos Correios",
  sem_custo: "ainda sem custo",
};
export const ROTULO_MODO_RASTREIO: Record<string, string> = {
  api: "API",
  planilha: "planilha importada",
  correios_api: "API dos Correios",
  sem_rastreio: "sem rastreio",
};
export const ROTULO_FONTE_CUSTO: Record<string, string> = { fatura: "Fatura", api: "API", postagem: "Postagem" };
