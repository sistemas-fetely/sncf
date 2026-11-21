type AuthClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  auth: { getClaims(token: string): Promise<{ data: { claims?: { sub?: string } } | null; error: unknown }> };
};

export async function autorizarSync(req: Request, sb: AuthClient): Promise<void> {
  const cron = req.headers.get("x-cron-secret");
  if (cron !== null) {
    const { data, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || typeof data !== "string" || !data) throw new Error("Não foi possível validar o x-cron-secret.");
    if (!cron || cron !== data) throw new Error("x-cron-secret inválido.");
    return;
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Sem x-cron-secret e sem sessão.");
  const { data, error } = await sb.auth.getClaims(authorization.slice(7));
  const userId = data?.claims?.sub;
  if (error || !userId) throw new Error("Sessão inválida.");
  const role = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (role.error) throw new Error(`Falha ao checar permissão: ${role.error.message}`);
  if (role.data !== true) throw new Error("Requer super_admin para sincronizar recebimentos XPM manualmente.");
}