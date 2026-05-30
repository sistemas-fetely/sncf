import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authorization Bearer ausente ou malformado" });
    }
    const senhaRecebida = authHeader.substring(7).trim();

    const { data: senhaEsperada, error: vaultError } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });

    if (vaultError || !senhaEsperada) {
      console.error("[recebe-pedido] Falha ao ler senha do cofre", vaultError);
      return jsonResponse(500, { error: "Erro de configuração interna" });
    }

    if (senhaRecebida !== senhaEsperada) {
      console.warn("[recebe-pedido] Senha inválida");
      return jsonResponse(401, { error: "Senha inválida" });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corpo JSON malformado" });
    }

    const obrigatorios = [
      "cnpj",
      "id_externo",
      "data_pedido",
      "valor_bruto",
      "valor_liquido",
      "condicao_solicitada",
      "forma_solicitada",
    ];
    const faltando = obrigatorios.filter((f) => body[f] === undefined || body[f] === null);
    if (faltando.length > 0) {
      return jsonResponse(400, {
        error: "Campos obrigatórios ausentes",
        campos_faltando: faltando,
      });
    }

    const { data, error } = await supabase.rpc("receber_pedido_externo", {
      p_cnpj: body.cnpj,
      p_id_externo: body.id_externo,
      p_data_pedido: body.data_pedido,
      p_valor_bruto: body.valor_bruto,
      p_valor_liquido: body.valor_liquido,
      p_condicao_solicitada: body.condicao_solicitada,
      p_forma_solicitada: body.forma_solicitada,
      p_desconto_pct: body.desconto_pct ?? null,
      p_vendedor: body.vendedor ?? null,
      p_origem: body.origem ?? null,
      p_itens_json: body.itens_json ?? null,
      p_recebido_via: body.recebido_via ?? "api",
    });

    if (error) {
      const erroDoCliente = error.code === "22023";
      console.error("[recebe-pedido] Erro na RPC", {
        code: error.code,
        message: error.message,
        id_externo: body.id_externo,
      });
      return jsonResponse(erroDoCliente ? 400 : 500, {
        error: error.message,
        code: error.code,
      });
    }

    console.log("[recebe-pedido] Sucesso", {
      id_externo: body.id_externo,
      pedido_id: data?.pedido_id,
      status: data?.status,
      estagio: data?.estagio_inicial,
    });

    return jsonResponse(200, data);
  } catch (e) {
    const err = e as Error;
    console.error("[recebe-pedido] Exceção não tratada", err);
    return jsonResponse(500, { error: "Erro interno: " + err.message });
  }
});
