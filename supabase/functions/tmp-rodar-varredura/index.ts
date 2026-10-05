import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: s } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/varrer-divergencia-bling`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": s }, body: JSON.stringify({ limite: 20 }),
  });
  return new Response(await r.text(), { status: r.status });
});
