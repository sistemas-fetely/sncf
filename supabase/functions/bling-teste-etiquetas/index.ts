// TEMP: taxa de preenchimento de etiquetas nos pedidos conhecidos (apagar apos teste)
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureFreshToken, BlingConfig } from "../_shared/bling/bling-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async () => {
  try {
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("client_id, client_secret, access_token, refresh_token, token_expires_at")
      .eq("sistema", "bling")
      .single();

    const token = await ensureFreshToken(supabase, cfg as BlingConfig);
    const base = `https://api.bling.com.br/Api/v3`;
    const H = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const alvos: Record<string, number> = {
      "PED-2135 (Correios, etiqueta conhecida)": 26604185035,
      "PED-2108 (Braspress)": 26622903042,
      "PED-2157 (Braspress)": 26652508220,
      "PED-2033/01 (Braspress)": 26640339272,
      "PED-2111 (Braspress)": 26652666431,
      "PED-2018/01 (Icaro)": 26640362149,
    };

    const out: any = {};
    for (const [nome, id] of Object.entries(alvos)) {
      const u = `${base}/logisticas/etiquetas?formato=PDF&idsVendas[]=${id}`;
      const resp = await fetch(u, { headers: H });
      const texto = await resp.text();
      if (resp.status === 200) {
        const j = JSON.parse(texto);
        const lista = j?.data || [];
        out[nome] = {
          status: 200,
          etiquetas: lista.length,
          ids: lista.map((e: any) => e.id),
          temLink: lista.some((e: any) => !!e.link),
        };
      } else {
        out[nome] = { status: resp.status, corpo: texto.slice(0, 300) };
      }
      await sleep(1200); // rate limit 3 req/s
    }

    return new Response(JSON.stringify(out, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ erro: String(e?.message || e) }), { status: 500 });
  }
});
