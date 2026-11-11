interface Sessao { access_token: string; expires_at?: number }
interface Auth {
  getSession: () => Promise<{ data: { session: Sessao | null }; error: { message: string } | null }>;
  refreshSession: () => Promise<{ data: { session: Sessao | null }; error: { message: string } | null }>;
}

export async function tokenEnvioXpm(auth: Auth, renovar = false): Promise<string> {
  let resultado = await auth.getSession();
  const sessao = resultado.data.session;
  if (resultado.error) throw new Error(resultado.error.message);
  if (!sessao) throw new Error("Sessão expirada — entre novamente antes de enviar pra XPM.");
  if (renovar || (sessao.expires_at ?? 0) <= Date.now() / 1000 + 60) {
    resultado = await auth.refreshSession();
  }
  if (resultado.error) throw new Error(resultado.error.message);
  const token = resultado.data.session?.access_token;
  if (!token) throw new Error("Sessão expirada — entre novamente antes de enviar pra XPM.");
  return token;
}