import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Token público de teste do Linketrack
const LT_USER  = "teste";
const LT_TOKEN = "1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f";

async function buscarLinketrack(etiqueta: string): Promise<any> {
  const url = `https://api.linketrack.com/track/json?user=${LT_USER}&token=${LT_TOKEN}&codigo=${etiqueta}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Linketrack (${resp.status}) para ${etiqueta}`);
  return resp.json();
}

function derivarStatus(eventos: any[]): { status: string; entregue: boolean; dataEntrega: string | null } {
  if (!eventos?.length) return { status: "Sem eventos", entregue: false, dataEntrega: null };
  const ultimo = eventos[0]; // Linketrack retorna mais recente primeiro
  const desc = (ultimo?.descricao ?? ultimo?.status ?? "").toLowerCase();
  const entregue = /entregue|delivered/i.test(desc);
  const dataEntrega = entregue ? (ultimo?.data ?? ultimo?.dtHrCriado ?? null) : null;
  return {
    status: ultimo?.descricao ?? ultimo?.status ?? "—",
    entregue,
    dataEntrega,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: lancamentos, error } = await supabase
      .from("correios_lancamentos")
      .select("etiqueta")
      .eq("empresa_frete", "frenet");

    if (error) throw error;
    const etiquetas = (lancamentos ?? []).map((l: any) => l.etiqueta);

    const resultados: any[] = [];
    const erros: string[] = [];

    for (let i = 0; i < etiquetas.length; i += 5) {
      const lote = etiquetas.slice(i, i + 5);
      await Promise.all(lote.map(async (etiqueta: string) => {
        try {
          const dados = await buscarLinketrack(etiqueta);
          const eventos = dados?.eventos ?? dados?.tracks ?? [];
          const { status, entregue, dataEntrega } = derivarStatus(eventos);

          const { error: upErr } = await supabase
            .from("pedido_rastreamento")
            .update({
              status_atual: status,
              entregue,
              data_ultima_atualizacao: new Date().toISOString(),
              eventos: eventos,
              ...(dataEntrega ? { data_ultima_atualizacao: dataEntrega } : {}),
            })
            .eq("codigo_rastreio", etiqueta);

          if (upErr) erros.push(`${etiqueta}: ${upErr.message}`);
          else resultados.push({ etiqueta, status, entregue });
        } catch (e) {
          erros.push(`${etiqueta}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }));
      if (i + 5 < etiquetas.length) await sleep(1200);
    }

    const entregues = resultados.filter(r => r.entregue).length;
    const emTransito = resultados.filter(r => !r.entregue).length;

    return new Response(JSON.stringify({
      ok: true,
      total: etiquetas.length,
      processados: resultados.length,
      entregues,
      emTransito,
      erros: erros.length > 0 ? erros : undefined,
      amostra: resultados.slice(0, 5),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
