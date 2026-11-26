// Porta x-cron-secret: só continuação de comparação (diff + execucao_id) e incremental. O resto exige sessão.
export function portaCronPermite(body: { acao?: string; execucao_id?: string } | null): boolean {
  if (!body) return false;
  if (body.acao === "incremental") return true;
  return body.acao === "diff" && typeof body.execucao_id === "string" && body.execucao_id.length > 0;
}
