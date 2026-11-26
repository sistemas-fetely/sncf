// APOSENTADA em 26/11/2026 (frente BLING-MOTOR-UNICO-2, aprovado pelo Flavio):
// bling-produto-sync passou a ser o único motor que lê e escreve cadastro de produto no Bling.
// Responde sempre 410; arquivos auxiliares da pasta e _shared/bling/* continuam em uso por outras funções.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-region, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  return new Response(
    JSON.stringify({
      ok: false,
      aposentada: true,
      erro: "Função aposentada em 26/11/2026 (frente BLING-MOTOR-UNICO-2). Use bling-produto-sync: previa/corrigir para correção por seleção, diff/incremental para comparação.",
    }),
    { status: 410, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
