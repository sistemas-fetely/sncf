// Edge Function: sync-contato-bling
// v1 — Sincroniza parceiro_comercial como contato no Bling (criar-ou-adotar).
// Modo único: body { parceiro_id }. Modo lote: body { origem:'backfill' } SEM parceiro_id
//   -> varre todos elegíveis, um a um, com pausa (respeita limite de 3 req/seg do Bling).
// Reusa _shared/bling/bling-client.ts. Log em bling_contatos_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extrai e limpa o primeiro número de uma string que pode ter vários (ex: "2124714678 / 2124734896")
const primeiroFone = (s: string | null | undefined): string | undefined => {
  const primeiro = (s || "").split(/[\/,]|(?:\s{2,})/)[0];
  const digits = soDigitos(primeiro);
  return digits.length >= 8 ? digits : undefined;
};

// Extrai o segundo número se existir
const segundoFone = (s: string | null | undefined): string | undefined => {
  const partes = (s || "").split(/[\/,]|(?:\s{2,})/);
  if (partes.length < 2) return undefined;
  const digits = soDigitos(partes[1]);
  return digits.length >= 8 ? digits : undefined;
};

const jwtRole = (token: string): string | null => {
  try {
    return JSON.parse(atob((token.split(".")[1] || ""))).role ?? null;
  } catch {
    return null;
  }
};

const PARCEIRO_COLS =
  "id, bling_id, razao_social, nome_fantasia, tipo_pessoa, cnpj, cpf, inscricao_estadual, isento_ie, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf, email, telefone, cadastro_incompleto, bandeira_vermelha";

function montarPayload(p: any, documento: string) {
  const tipo = p.tipo_pessoa === "PJ" ? "J" : "F";
  // IE defensiva: valida se tem entre 8 e 14 dígitos; se inválida, omite e usa não-contribuinte
  const ieDigitos = soDigitos(p.inscricao_estadual);
  const ieValida  = ieDigitos.length >= 8 && ieDigitos.length <= 14;
  const indicadorIe = ieValida ? 1 : (p.isento_ie ? 2 : 9);
  const iePayload   = ieValida
    ? p.inscricao_estadual!.trim()
    : (p.isento_ie ? "ISENTO" : undefined);
  return {
    nome: p.razao_social,
    fantasia: p.nome_fantasia || undefined,
    tipo,
    numeroDocumento: documento,
    ie: iePayload,
    indicadorIe,
    email: p.email || undefined,
    telefone: primeiroFone(p.telefone),
    celular: segundoFone(p.telefone) ?? primeiroFone(p.telefone),
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
}

// Sincroniza UM parceiro. Loga sempre. Retorna resumo.
async function syncOne(supabase: any, client: any, p: any, origem: string, acionadoPor: string | null) {
  const t0 = Date.now();

  if (p.bling_id) {
    return { parceiro_id: p.id, sucesso: true, bling_id: p.bling_id, ja_existia: true };
  }

  const documento = soDigitos(p.cnpj || p.cpf);
  const motivoSkip =
    p.cadastro_incompleto ? "cadastro_incompleto"
      : p.bandeira_vermelha ? "bandeira_vermelha"
      : !documento ? "sem_documento"
      : null;
  if (motivoSkip) {
    await supabase.from("bling_contatos_log").insert({
      parceiro_id: p.id, acionado_por: acionadoPor, origem,
      payload_enviado: null, resposta_status: null, resposta_body: null,
      bling_id_retornado: null, sucesso: false, erro_msg: `Ignorado: ${motivoSkip}`,
      duracao_ms: Date.now() - t0,
    });
    return { parceiro_id: p.id, sucesso: false, ignorado: true, motivo: motivoSkip };
  }

  const payload = montarPayload(p, documento);
  let blingId: string | null = null;
  let respStatus: number | null = null;
  let respBody: any = null;
  let sucesso = false;
  let erroMsg: string | null = null;
  let acao: string | null = null;

  try {
    const busca = await client.get(`/contatos?numeroDocumento=${encodeURIComponent(documento)}`);
    const lista = Array.isArray(busca?.data) ? busca.data : [];
    const existente = lista.find((c: any) => soDigitos(c?.numeroDocumento) === documento);

    if (existente?.id) {
      blingId = String(existente.id);
      acao = "adotado";
      respBody = busca;
      respStatus = 200;
      sucesso = true;
    } else {
      let criado = await client.post("/contatos", payload);

      // Retry sem IE se o Bling rejeitar por inscrição estadual inválida
      if (
        criado?.error &&
        JSON.stringify(criado.error).toLowerCase().includes("inscri")
      ) {
        console.warn("[sync-contato-bling] IE rejeitada pelo Bling — retry sem IE");
        const payloadSemIE = { ...payload, ie: undefined, indicadorIe: 9 };
        criado = await client.post("/contatos", payloadSemIE);
      }

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

  await supabase.from("bling_contatos_log").insert({
    parceiro_id: p.id, acionado_por: acionadoPor, origem,
    payload_enviado: payload, resposta_status: respStatus, resposta_body: respBody,
    bling_id_retornado: blingId, sucesso, erro_msg: erroMsg, duracao_ms: Date.now() - t0,
  });

  if (sucesso && blingId) {
    await supabase.from("parceiros_comerciais").update({ bling_id: blingId }).eq("id", p.id);
    return { parceiro_id: p.id, sucesso: true, bling_id: blingId, acao };
  }
  return { parceiro_id: p.id, sucesso: false, erro: erroMsg };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const parceiro_id = body?.parceiro_id;
    const origem = body?.origem ?? "manual";
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
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", acionadoPor);
      const allowed = (roles || []).some((r: any) => ["super_admin", "admin_rh", "sops"].includes(r.role));
      if (!allowed) return err("Sem permissão (sops, admin_rh ou super_admin)", 403);
    } else {
      let sharedOk = false;
      const sharedHeader = req.headers.get("x-sync-secret") || "";
      if (sharedHeader) {
        const { data: vaultSecret } = await supabase.rpc("get_vault_secret", { p_name: "SYNC_CONTATO_SECRET" });
        sharedOk = typeof vaultSecret === "string" && vaultSecret.length > 0 && sharedHeader === vaultSecret;
      }
      const isService =
        authRaw === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        jwtRole(authRaw) === "service_role" ||
        sharedOk;
      if (!isService) return err("Sync automático/backfill não autorizado", 403);
    }

    // Config Bling + client (uma vez só, reaproveitado no lote)
    const { data: cfg } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (!cfg || !cfg.access_token) return err("Bling não conectado — fazer OAuth via /administrativo/bling", 503);
    const freshToken = await ensureFreshToken(supabase, cfg);
    const client = makeBlingClient(supabase, cfg, freshToken);

    // MODO ÚNICO
    if (parceiro_id) {
      const { data: p, error: pErr } = await supabase
        .from("parceiros_comerciais").select(PARCEIRO_COLS).eq("id", parceiro_id).maybeSingle();
      if (pErr || !p) return err("Parceiro não encontrado", 404);
      const r = await syncOne(supabase, client, p, origem, acionadoPor);
      if (r.sucesso || r.ignorado) {
        return ok({ ...r, mensagem: r.ignorado ? `Sync ignorado: ${r.motivo}` : `Contato ${r.acao ?? "sincronizado"} (id ${r.bling_id})` });
      }
      return err(r.erro || "Falha ao sincronizar contato", 502);
    }

    // MODO LOTE (backfill): varre elegíveis, um a um, com pausa (respeita 3 req/seg do Bling)
    if (origem !== "backfill") return err("Modo lote exige origem='backfill'");

    const { data: lista } = await supabase
      .from("parceiros_comerciais")
      .select(PARCEIRO_COLS)
      .is("bling_id", null)
      .eq("cadastro_incompleto", false)
      .eq("bandeira_vermelha", false)
      .order("created_at", { ascending: true })
      .limit(200);

    const elegiveis = (lista || []);
    let sucesso = 0, falha = 0, ignorado = 0;
    const erros: any[] = [];

    for (const p of elegiveis) {
      const r = await syncOne(supabase, client, p, "backfill", acionadoPor);
      if (r.ignorado) ignorado++;
      else if (r.sucesso) sucesso++;
      else { falha++; if (erros.length < 10) erros.push({ parceiro_id: p.id, erro: r.erro }); }
      await sleep(1100); // ~1 parceiro/seg -> abaixo do limite de 3 req/seg
    }

    return ok({
      sucesso: true,
      modo: "backfill",
      processados: elegiveis.length,
      sincronizados: sucesso,
      ignorados: ignorado,
      falhas: falha,
      amostra_erros: erros,
    });
  } catch (e) {
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});