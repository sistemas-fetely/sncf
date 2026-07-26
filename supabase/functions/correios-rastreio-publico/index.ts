import { makeSupabase, rastrearCodigoSRO } from "../_shared/correios-sro.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = makeSupabase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { codigo } = await req.json();
    if (!codigo) throw new Error("codigo obrigatório");

    const res = await rastrearCodigoSRO(supabase, codigo);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, codigo, erro: res.erro }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, codigo, status: res.status, entregue: res.entregue, eventos: res.eventos ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
