// Edge function: analise-despesas-insights
// Recebe o resumo agregado calculado pelo front (nunca dados brutos) e devolve
// narrativa executiva via Lovable AI Gateway. Mesmo esqueleto de dashboard-insights.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Movimento {
  nome: string;
  valorAtual: number;
  valorAnterior: number;
  delta: number;
  deltaPct: number | null;
}

interface ResumoDespesas {
  mesAtual: string;
  mesAnterior: string;
  operacionalAtual: number;
  operacionalAnterior: number;
  capexAtual: number;
  media3m: number;
  topAumentos: Movimento[];
  topQuedas: Movimento[];
  gastosNovos: { nome: string; valor: number }[];
  gastosSumiram: { nome: string; valor: number }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = (await req.json()) as ResumoDespesas;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const pct = (p: number | null) => (p === null ? "novo" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

    const prompt = `Você é o analista financeiro do SNCF (Sistema Fetely). A Fetely é uma marca brasileira de celebrações e mesa posta. Analise as DESPESAS POR COMPETÊNCIA do mês e escreva uma leitura executiva.

DADOS (${r.mesAtual} vs ${r.mesAnterior}):
- Despesa operacional: ${fmt(r.operacionalAtual)} (anterior: ${fmt(r.operacionalAnterior)}; média 3m: ${fmt(r.media3m)})
- CAPEX do mês (fora do operacional): ${fmt(r.capexAtual)}

MAIORES AUMENTOS:
${r.topAumentos.map((m) => `- ${m.nome}: ${fmt(m.valorAtual)} (${pct(m.deltaPct)}, Δ ${fmt(m.delta)})`).join("\n") || "- nenhum"}

MAIORES QUEDAS:
${r.topQuedas.map((m) => `- ${m.nome}: ${fmt(m.valorAtual)} (${pct(m.deltaPct)}, Δ ${fmt(m.delta)})`).join("\n") || "- nenhuma"}

GASTOS NOVOS NO MÊS: ${r.gastosNovos.map((g) => `${g.nome} (${fmt(g.valor)})`).join(", ") || "nenhum"}
GASTOS QUE ZERARAM: ${r.gastosSumiram.map((g) => `${g.nome} (era ${fmt(g.valor)})`).join(", ") || "nenhum"}

INSTRUÇÕES:
1. Escreva 4 a 6 bullets curtos e diretos, em português, tom executivo.
2. Comece pelo movimento mais relevante em R$ absolutos, não em %.
3. Diferencie variação estrutural (contrato novo, gasto recorrente que mudou de patamar) de pontual (compra única, sazonalidade).
4. CAPEX é investimento: comente separado, nunca como "aumento de despesa".
5. Termine com UMA pergunta que o gestor deveria investigar.
6. Não invente dados. Não use markdown de título, apenas bullets com hífen.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI Gateway ${aiResponse.status}: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const insight = aiData?.choices?.[0]?.message?.content ?? "";
    if (!insight) throw new Error("Resposta vazia do AI Gateway");

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
