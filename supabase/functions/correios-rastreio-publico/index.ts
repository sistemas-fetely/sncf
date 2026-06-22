import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LT_USER  = "teste";
const LT_TOKEN = "1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { codigo } = await req.json();
    if (!codigo) throw new Error("codigo obrigatório");

    const url = `https://api.linketrack.com/track/json?user=${LT_USER}&token=${LT_TOKEN}&codigo=${codigo}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    const dados = await resp.json();

    console.log(`Linketrack ${codigo}: status=${resp.status} dados=${JSON.stringify(dados).slice(0,300)}`);

    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, codigo, erro: `Linketrack ${resp.status}`, dados }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventos = dados?.eventos ?? dados?.tracks ?? dados?.rastros ?? [];
    const ultimo = eventos[0];
    const descricao = ultimo?.descricao ?? ultimo?.status ?? ultimo?.situacao ?? null;
    const entregue = descricao ? /entregue|delivered/i.test(descricao) : false;
    const status = descricao ?? (dados?.status ?? "Sem eventos");

    const { error } = await supabase
      .from("pedido_rastreamento")
      .update({
        status_atual: status,
        entregue,
        eventos: eventos.length > 0 ? eventos : undefined,
        data_ultima_atualizacao: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("codigo_rastreio", codigo);

    if (error) throw new Error(`upsert: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, codigo, status, entregue, eventos: eventos.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
