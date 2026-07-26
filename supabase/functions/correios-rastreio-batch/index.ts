import { makeSupabase, rastrearCodigoSRO } from "../_shared/correios-sro.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = makeSupabase();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: pendentes, error } = await supabase
      .from("vw_rastreio_correios_pendente")
      .select("codigo_rastreio");

    if (error) throw error;

    const codigos = (pendentes ?? [])
      .map((r: any) => r.codigo_rastreio)
      .filter((c: string | null): c is string => !!c);

    let atualizados = 0;
    const erros: Array<{ codigo: string; erro: string }> = [];
    const tokenCache: { token?: string } = {};

    for (let i = 0; i < codigos.length; i++) {
      const codigo = codigos[i];
      const res = await rastrearCodigoSRO(supabase, codigo, tokenCache);
      if (res.ok) atualizados++;
      else erros.push({ codigo, erro: res.erro ?? "erro desconhecido" });
      if (i < codigos.length - 1) await sleep(800);
    }

    return new Response(JSON.stringify({
      ok: true,
      total: codigos.length,
      atualizados,
      erros: erros.length,
      detalhe_erros: erros.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
