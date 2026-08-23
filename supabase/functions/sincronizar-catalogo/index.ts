// 🔵 SNCF — sincronizar-catalogo
// SNCF puxa produtos do FOP via PostgREST e upserta em sncf_produtos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";

const CAMPOS = [
  "sku",
  "nome_comercial",
  "preco_atacado",
  "peso_g",
  "multiplos",
  "ativo",
  "altura_cm",
  "largura_cm",
  "profundidade_cm",
  "ean",
  "ncm",
  "cest",
  "marca",
  "linha",
  "grupo",
  "tipo",
  "colecao",
  "cor_nome",
  "tamanho_numero",
  "descricao_produto",
  "tipo_embalagem",
  "material",
  "material_descritivo",
  "nome_completo",
  "origem_fisc",
  "origem_prod",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Job que roda com service_role — exige cron secret ou super_admin (achado crítico 23/08/2026).
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      const { data: esperado } = await supabase.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (!esperado || cronSecret !== esperado) return jsonResponse(401, { error: "x-cron-secret inválido." });
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse(401, { error: "Não autorizado: token ausente." });
      const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userErr || !userData?.user) return jsonResponse(401, { error: "Não autorizado: sessão inválida." });
      const { data: ehSuper, error: roleErr } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "super_admin" });
      if (roleErr) return jsonResponse(500, { error: `Falha ao checar permissão: ${roleErr.message}` });
      if (!ehSuper) return jsonResponse(403, { error: "Apenas super_admin pode sincronizar o catálogo." });
    }

    // Lê service role key do FOP do cofre SNCF
    const { data: fopKey } = await supabase.rpc("get_vault_secret", {
      p_name: "FOP_SERVICE_ROLE_KEY",
    });

    if (!fopKey) {
      return jsonResponse(500, { error: "Secret FOP_SERVICE_ROLE_KEY não configurado no vault SNCF" });
    }

    // Puxa produtos ativos do FOP via PostgREST
    const resp = await fetch(
      `${FOP_URL}/rest/v1/products?select=${CAMPOS.join(",")}&ativo=eq.true&limit=2000`,
      {
        headers: {
          "apikey": fopKey,
          "Authorization": `Bearer ${fopKey}`,
        },
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`FOP respondeu ${resp.status}: ${err}`);
    }

    const produtos = await resp.json() as Array<Record<string, unknown>>;

    if (!produtos || produtos.length === 0) {
      return jsonResponse(200, { ok: true, upsertados: 0, mensagem: "Nenhum produto ativo no FOP" });
    }

    // Upsert em sncf_produtos em lotes de 500
    const LOTE = 500;
    let totalUpsertados = 0;

    for (let i = 0; i < produtos.length; i += LOTE) {
      const lote = produtos.slice(i, i + LOTE);

      const { error } = await (supabase as any)
        .from("sncf_produtos")
        .upsert(
          lote.map((p) => {
            const row: Record<string, unknown> = {};
            for (const campo of CAMPOS) row[campo] = p[campo];
            row.atualizado_em = new Date().toISOString();
            return row;
          }),
          { onConflict: "sku" }
        );

      if (error) throw error;
      totalUpsertados += lote.length;
    }

    console.log(`[sincronizar-catalogo] ${totalUpsertados} produtos upsertados em sncf_produtos`);

    return jsonResponse(200, {
      ok: true,
      upsertados: totalUpsertados,
      mensagem: `${totalUpsertados} produtos sincronizados`,
    });

  } catch (e) {
    console.error("[sincronizar-catalogo]", e);
    return jsonResponse(500, { error: String(e) });
  }
});
