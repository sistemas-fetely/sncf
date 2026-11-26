// Porta x-cron-secret: só continuação de comparação (acao diff + execucao_id).
export function portaCronPermite(body: { acao?: string; execucao_id?: string } | null): boolean {
  return !!body && body.acao === "diff" && typeof body.execucao_id === "string" && body.execucao_id.length > 0;
}
