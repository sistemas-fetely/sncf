// Gate "cron OU sessão" (29/09/2026). Endpoints operacionais rodam com service_role;
// sem este gate, qualquer um com a chave anon (pública) disparava o job.
// Passa: (a) cron com x-cron-secret igual ao SYNC_CRON_SECRET do vault; ou
// (b) usuário com sessão válida (telas que chamam a edge). FAIL-CLOSED.
// deno-lint-ignore-file no-explicit-any
export async function gateCronOuSessao(
  req: Request,
  sbServiceRole: any,
  cors: Record<string, string>,
): Promise<Response | null> {
  const nega = (msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: esperado, error } = await sbServiceRole.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !esperado) return nega("Não foi possível validar o x-cron-secret.");
    return cronSecret === esperado ? null : nega("x-cron-secret inválido.");
  }
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return nega("Não autorizado: token ausente.");
  const { data, error } = await sbServiceRole.auth.getUser(auth.slice("Bearer ".length).trim());
  if (error || !data?.user) return nega("Não autorizado: sessão inválida.");
  return null;
}
