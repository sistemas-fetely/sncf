// 🔵 SNCF — sincronizar-catalogo — DESATIVADA 07/09/2026
// Era cópia da sincronizar-catalogo do projeto FOP, que é a que o cron sync-catalogo-diario
// realmente chama (job 16, 03:00 BRT). Esta fazia upsert direto em sncf_produtos com
// onConflict "sku", fora da RPC. Viola UM-TRILHO-SÓ e FONTE-ÚNICA.
// Sem chamador em nenhum dos dois repos. Mantida como 410 porque apagar a pasta não
// desativa o artefato já publicado. Histórico do código no git.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      error: "Endpoint desativado em 07/09/2026.",
      motivo: "Escrita direta em sncf_produtos fora da RPC (UM-TRILHO-SÓ).",
      use: "O cron chama a sincronizar-catalogo do FOP, que empurra para recebe-pedido {tipo:'catalogo'}.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
