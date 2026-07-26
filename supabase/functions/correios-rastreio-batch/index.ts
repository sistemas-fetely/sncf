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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rastrearCodigo(codigo: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const url = `https://api.linketrack.com/track/json?user=${LT_USER}&token=${LT_TOKEN}&codigo=${codigo}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    const dados = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return { ok: false, erro: `Linketrack ${resp.status}` };
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

    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: pendentes, error } = await supabase
      .from("pedido_rastreamento")
      .select("codigo_rastreio")
      .or("entregue.is.false,entregue.is.null");

    if (error) throw error;

    const codigos = (pendentes ?? [])
      .map((r: any) => r.codigo_rastreio)
      .filter((c: string | null): c is string => !!c);

    let atualizados = 0;
    const erros: Array<{ codigo: string; erro: string }> = [];

    for (let i = 0; i < codigos.length; i++) {
      const codigo = codigos[i];
      const res = await rastrearCodigo(codigo);
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
