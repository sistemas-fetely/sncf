// 🔵 SNCF — receber-catalogo
// Recebe lote de produtos do FOP e upserta em sncf_produtos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    // Autentica via bearer token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenEsperado } = await supabase.rpc("get_vault_secret", {
      p_name: "SNCF_CATALOGO_TOKEN",
    });

    if (!tokenEsperado || token !== tokenEsperado) {
      return jsonResponse(401, { error: "Token inválido" });
    }

    const body = await req.json();
    const produtos: Array<{
      sku: string;
      nome_comercial: string;
      preco_atacado: number;
      peso_g: number;
      multiplos: number;
      ativo: boolean;
    }> = body?.produtos ?? [];

    if (produtos.length === 0) {
      return jsonResponse(400, { error: "Nenhum produto no payload" });
    }

    // Upsert em sncf_produtos
    const { error, count } = await (supabase as any)
      .from("sncf_produtos")
      .upsert(
        produtos.map((p) => ({
          sku:           p.sku,
          nome_comercial: p.nome_comercial,
          preco_atacado: p.preco_atacado,
          peso_g:        p.peso_g,
          multiplos:     p.multiplos,
          ativo:         p.ativo,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: "sku", count: "exact" }
      );

    if (error) throw error;

    console.log(`[receber-catalogo] ${count ?? produtos.length} produtos upsertados`);

    return jsonResponse(200, {
      ok: true,
      upsertados: count ?? produtos.length,
    });

  } catch (e) {
    console.error("[receber-catalogo]", e);
    return jsonResponse(500, { error: String(e) });
  }
});
