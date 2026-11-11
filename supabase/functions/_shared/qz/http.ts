import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
export async function contextoQz(req: Request) {
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon) throw new Error("Configuração do ambiente ausente.");
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const usuario = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await usuario.auth.getClaims(authorization.slice(7));
  if (error || !data?.claims?.sub) return null;
  const servidor = createClient(url, service, { auth: { persistSession: false } });
  return { usuario, servidor, userId: data.claims.sub };
}
export async function lerSegredo(servidor: NonNullable<Awaited<ReturnType<typeof contextoQz>>>["servidor"], nome: string): Promise<string | null> {
  const { data, error } = await servidor.rpc("get_vault_secret", { p_name: nome });
  if (error) throw new Error("Falha ao consultar a credencial QZ.");
  return typeof data === "string" && data ? data : null;
}
export { corsHeaders };