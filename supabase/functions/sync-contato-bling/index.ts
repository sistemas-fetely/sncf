// Edge Function: sync-contato-bling
// v1 — Sincroniza um parceiro_comercial como contato no Bling (criar-ou-adotar).
// Reusa _shared/bling/bling-client.ts. Log em bling_contatos_log.
// origem: 'manual' (botão, JWT humano) | 'automatico' (trigger) | 'backfill' (service role).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ok = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ sucesso: false, erro: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const soDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// Lê o claim "role" de um JWT sem verificar assinatura (o platform já validou via verify_jwt).
const jwtRole = (token: string): string | null => {
  try {
    return JSON.parse(atob((token.split(".")[1] || ""))).role ?? null;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Input
    const body = await req.json().catch(() => ({}));
    const parceiro_id = body?.parceiro_id;
    const origem = body?.origem ?? "manual";
    if (!parceiro_id) return err("parceiro_id obrigatório");
    if (!["manual", "automatico", "backfill"].includes(origem)) {
      return err("origem inválida (manual | automatico | backfill)");
    }

    // Auth por origem
    const authRaw = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    let acionadoPor: string | null = null;

    if (origem === "manual") {
      const { data: userData, error: userErr } = await supabase.auth.getUser(authRaw);
      if (userErr || !userData.user) return err("Não autorizado", 401);
      acionadoPor = userData.user.id;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", acionadoPor);
      const allowed = (roles || []).some((r: any) =>
        ["super_admin", "admin_rh", "sops"].includes(r.role)
      );
      if (!allowed) return err("Sem permissão (sops, admin_rh ou super_admin)", 403);
    } else {
      // automatico / backfill: exige um JWT com role service_role.
      // Aceita tanto a env exata quanto qualquer JWT service_role (vault e env podem diferir).
      const isService =
        authRaw === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        jwtRole(authRaw) === "service_role";
      if (!isService) return err("Sync automático/backfill requer service role", 403);
    }

    // 1. Parceiro
    const { data: p, error: pErr } = await supabase
      .from("parceiros_comerciais")
      .select(
        "id, bling_id, razao_social, nome_fantasia, tipo_pessoa, cnpj, cpf, inscricao_estadual, isento_ie, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf, email, telefone, cadastro_incompleto, bandeira_vermelha",
      )
      .eq("id", parceiro_id)
      .maybeSingle();
    if (pErr || !p) return err("Parceiro não encontrado", 404);

    // 2. Já sincronizado? (v1 não re-empurra — isso é v2)
    if (p.bling_id) {
      return ok({
        sucesso: true,
        bling_id: p.bling_id,
        ja_existia: true,
        mensagem: "Parceiro já possui bling_id",
      });
    }

    const documento = soDigitos(p.cnpj || p.cpf);

    // 3. Guardas (skip não é erro — é desfecho válido)
    const motivoSkip =
      p.cadastro_incompleto ? "cadastro_incompleto"
        : p.bandeira_vermelha ? "bandeira_vermelha"
        : !documento ? "sem_documento"
        : null;
    if (motivoSkip) {
      await supabase.from("bling_contatos_log").insert({
        parceiro_id,
        acionado_por: acionadoPor,
        origem,
        payload_enviado: null,
        resposta_status: null,
        resposta_body: null,
        bling_id_retornado: null,
        sucesso: false,
        erro_msg: `Ignorado: ${motivoSkip}`,
        duracao_ms: Date.now() - t0,
      });
      return ok({
        sucesso: false,
        ignorado: true,
        motivo: motivoSkip,
        mensagem: `Sync ignorado: ${motivoSkip}`,
      });
    }

    // 4. Config Bling + client
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) {
      return err("Bling não conectado — fazer OAuth via /administrativo/bling", 503);
    }
    const freshToken = await ensureFreshToken(supabase, cfg);
    const client = makeBlingClient(supabase, cfg, freshToken);

    // 5. Payload do contato
    const tipo = p.tipo_pessoa === "PJ" ? "J" : "F";
    const indicadorIe = p.inscricao_estadual ? 1 : (p.isento_ie ? 2 : 9);
    const payload: any = {
      nome: p.razao_social,
      fantasia: p.nome_fantasia || undefined,
      tipo,
      numeroDocumento: documento,
      ie: p.inscricao_estadual || undefined,
      indicadorIe,
      email: p.email || undefined,
      telefone: p.telefone || undefined,
      celular: p.telefone || undefined,
      situacao: "A",
      endereco: {
        geral: {
          endereco: p.logradouro || undefined,
          numero: p.numero || undefined,
          complemento: p.endereco_complemento || undefined,
          bairro: p.bairro || undefined,
          cep: soDigitos(p.cep) || undefined,
          municipio: p.cidade || undefined,
          uf: p.uf || undefined,
        },
      },
    };

    // 6. Criar-ou-adotar
    let blingId: string | null = null;
    let respStatus: number | null = null;
    let respBody: any = null;
    let sucesso = false;
    let erroMsg: string | null = null;
    let acao: "adotado" | "criado" | null = null;

    try {
      // Busca por documento. Adota só se o documento BATER de verdade
      // (defesa: se o Bling ignorar o filtro e devolver lista, não linka contato errado).
      const busca = await client.get(
        `/contatos?numeroDocumento=${encodeURIComponent(documento)}`,
      );
      const lista = Array.isArray(busca?.data) ? busca.data : [];
      const existente = lista.find(
        (c: any) => soDigitos(c?.numeroDocumento) === documento,
      );

      if (existente?.id) {
        blingId = String(existente.id);
        acao = "adotado";
        respBody = busca;
        respStatus = 200;
        sucesso = true;
      } else {
        const criado = await client.post("/contatos", payload);
        respBody = criado;
        const idCriado = criado?.data?.id ?? criado?.id ?? null;
        blingId = idCriado != null ? String(idCriado) : null;
        acao = "criado";
        respStatus = 200;
        sucesso = !!blingId;
        if (!sucesso) erroMsg = "Bling retornou sem id de contato";
      }
    } catch (e) {
      erroMsg = (e as Error).message;
      const m = erroMsg?.match(/(\d{3}):/);
      if (m) respStatus = parseInt(m[1]);
      sucesso = false;
    }

    const duracaoMs = Date.now() - t0;

    // 7. Log (fail-loud: resposta_body guarda o motivo exato de recusa)
    await supabase.from("bling_contatos_log").insert({
      parceiro_id,
      acionado_por: acionadoPor,
      origem,
      payload_enviado: payload,
      resposta_status: respStatus,
      resposta_body: respBody,
      bling_id_retornado: blingId,
      sucesso,
      erro_msg: erroMsg,
      duracao_ms: duracaoMs,
    });

    // 8. Grava bling_id no parceiro
    if (sucesso && blingId) {
      await supabase
        .from("parceiros_comerciais")
        .update({ bling_id: blingId })
        .eq("id", parceiro_id);

      return ok({
        sucesso: true,
        bling_id: blingId,
        acao,
        mensagem: `Contato ${acao} no Bling (id ${blingId})`,
        duracao_ms: duracaoMs,
      });
    }

    return err(erroMsg || "Falha ao sincronizar contato", 502);
  } catch (e) {
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});
