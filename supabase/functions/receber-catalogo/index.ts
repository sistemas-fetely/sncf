// 🔵 SNCF — receber-catalogo — DESATIVADA 07/09/2026
// Fazia upsert direto em sncf_produtos com onConflict "sku", fora da RPC.
// Viola UM-TRILHO-SÓ. Trilho único de catálogo: recebe-pedido {tipo:"catalogo"} -> fn_upsert_catalogo.
// Sem chamador em sncf nem em fetely-catalog-pro. Mantida como 410 porque apagar a pasta
// não desativa o artefato já publicado. Histórico do código no git.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      error: "Endpoint desativado em 07/09/2026.",
      motivo: "Escrita direta em sncf_produtos fora da RPC (UM-TRILHO-SÓ).",
      use: "POST recebe-pedido com {tipo:'catalogo', produtos:[...]}",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
