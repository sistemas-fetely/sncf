import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: s } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/varrer-divergencia-bling`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": s }, body: await req.text(),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
});
