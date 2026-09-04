import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Doutrina #15 — JWT forward Edge→Edge.
 * Não usar adminClient.functions.invoke() pra chamar send-transactional-email:
 * isso envia o token de service_role e a função destino faz auth.getUser(token),
 * que falha com 401 (service_role não é user). Forward do JWT ORIGINAL do user.
 */
async function invokeSendTransactionalEmail(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "apikey": anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let parsed: unknown = null;
  try {
    parsed = await resp.json();
  } catch {
    parsed = null;
  }
  return { ok: resp.ok, status: resp.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;

    if (claimsError || typeof callerId !== "string") {
      console.error("Auth claims error:", claimsError?.message ?? "Token inválido");
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller roles
    const { data: isSuperAdmin } = await userClient.rpc("has_role", {
      _user_id: callerId,
      _role: "super_admin",
    });
    const { data: isAdminRH } = await userClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin_rh",
    });

    if (!isSuperAdmin && !isAdminRH) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, full_name, roles, colaborador_tipo } = body;
      if (!email || !password || !full_name) {
        return new Response(JSON.stringify({ error: "Email, senha e nome são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // admin_rh cannot assign super_admin
      if (!isSuperAdmin && roles?.includes("super_admin")) {
        return new Response(JSON.stringify({ error: "Sem permissão para atribuir super_admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Approve profile and set colaborador_tipo
      const profileUpdate: Record<string, unknown> = { approved: true };
      if (colaborador_tipo) {
        profileUpdate.colaborador_tipo = colaborador_tipo;
      }
      await adminClient.from("profiles").update(profileUpdate).eq("user_id", newUser.user.id);

      // Set roles if provided
      if (roles && roles.length > 0) {
        await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);
        const roleInserts = roles.map((role: string) => ({
          user_id: newUser.user.id,
          role,
        }));
        await adminClient.from("user_roles").insert(roleInserts);
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_user_standalone") {
      const { email, full_name, roles, colaborador_id, colaborador_tipo } = body;
      if (!email || !full_name) {
        return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // admin_rh cannot assign super_admin
      if (!isSuperAdmin && roles?.includes("super_admin")) {
        return new Response(JSON.stringify({ error: "Sem permissão para atribuir super_admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create user without password (will use recovery link for first access)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create/update profile
      await adminClient.from("profiles").upsert({
        user_id: newUser.user.id,
        full_name,
        approved: true,
        colaborador_tipo: colaborador_tipo || "all",
      }, { onConflict: "user_id" });

      // Assign roles
      if (roles && roles.length > 0) {
        await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);
        const roleInserts = roles.map((role: string) => ({
          user_id: newUser.user.id,
          role,
        }));
        await adminClient.from("user_roles").insert(roleInserts);
      }

      // Link to colaborador if provided
      if (colaborador_id && colaborador_tipo === "clt") {
        await adminClient.from("colaboradores_clt")
          .update({ user_id: newUser.user.id })
          .eq("id", colaborador_id);
      }
      if (colaborador_id && colaborador_tipo === "pj") {
        await adminClient.from("contratos_pj")
          .update({ user_id: newUser.user.id })
          .eq("id", colaborador_id);
      }

      // Send password recovery link for first access
      try {
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
        });
      } catch (linkErr) {
        console.error("Erro ao gerar link de recuperação:", linkErr);
      }

      // Send welcome email — Doutrina #15: forward JWT do user
      try {
        const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
          templateName: "boas-vindas-portal",
          recipientEmail: email,
          idempotencyKey: `boas-vindas-${newUser.user.id}`,
          templateData: {
            nome: full_name,
            email,
            link: Deno.env.get("SITE_URL") || "https://sncf.lovable.app",
          },
        });
        if (!r.ok) {
          console.error("[create_user_standalone] Falha em send-transactional-email:", r.status, r.body);
        }
      } catch (emailErr) {
        console.error("[create_user_standalone] Erro ao enviar e-mail de boas-vindas:", emailErr);
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /**
     * Sprint C2 (29/04/2026): criação manual de usuário com modelo NOVO
     * de grupos (grupo_acesso_usuarios).
     *
     * Body esperado:
     *   - email (obrigatório)
     *   - full_name (obrigatório)
     *   - grupo_ids: array de IDs de grupos_acesso (vazio = sem grupos)
     *
     * Doutrina:
     *   - UM TRILHO SÓ: vínculo usuário↔pessoa é feito depois pelo botão Vincular
     *     da Mesa de Usuários, via RPC `mesa_vincular_usuario`. Este wizard não
     *     escreve mais em colaboradores_clt/contratos_pj.
     *   - Email de boas-vindas com link de recovery (user define senha no 1º acesso)
     */
    if (action === "create_user_v2") {
      const { email, full_name, grupo_ids } = body;

      if (!email || !full_name) {
        return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;

      // Rollback helper: desfaz a criação se qualquer etapa de integridade falhar.
      // Torna create_user_v2 tudo-ou-nada: nunca deixa auth.user órfão nem meio-usuário.
      const rollbackUser = async (motivo: string, detail?: string) => {
        console.error("[create_user_v2] rollback:", motivo, detail);
        await adminClient.from("grupo_acesso_usuarios").delete().eq("user_id", userId);
        await adminClient.from("profiles").delete().eq("user_id", userId);
        await adminClient.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: motivo, detail: detail ?? null }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      };

      const { error: profileErr } = await adminClient.from("profiles").upsert({
        user_id: userId,
        full_name,
        approved: true,
        colaborador_tipo: "all",
      }, { onConflict: "user_id" });
      if (profileErr) return await rollbackUser("Falha ao criar o perfil do usuário", profileErr.message);

      if (grupo_ids && Array.isArray(grupo_ids) && grupo_ids.length > 0) {
        const grupoInserts = grupo_ids.map((gid: string) => ({
          grupo_acesso_id: gid,
          user_id: userId,
          adicionado_por: callerId,
        }));
        const { error: grupoErr } = await adminClient.from("grupo_acesso_usuarios").insert(grupoInserts);
        if (grupoErr) return await rollbackUser("Falha ao atribuir grupos ao usuário", grupoErr.message);
      }

      let linkPrimeiroAcesso: string | null = null;
      try {
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        if (linkErr) {
          console.error("Erro ao gerar link de recuperação:", linkErr);
        } else {
          linkPrimeiroAcesso = linkData?.properties?.action_link ?? null;
        }
      } catch (linkErr) {
        console.error("Erro ao gerar link de recuperação:", linkErr);
      }

      try {
        const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
          templateName: "boas-vindas-portal",
          recipientEmail: email,
          idempotencyKey: `boas-vindas-${userId}-${Date.now()}`,
          templateData: {
            nome: full_name,
            email,
            link: Deno.env.get("SITE_URL") || "https://sncf.lovable.app",
          },
        });
        if (!r.ok) {
          console.error("[create_user_v2] Falha em send-transactional-email:", r.status, r.body);
        }
      } catch (emailErr) {
        console.error("[create_user_v2] Erro ao enviar e-mail de boas-vindas:", emailErr);
      }

      return new Response(JSON.stringify({
        success: true,
        user_id: userId,
        email,
        grupos_atribuidos: grupo_ids?.length || 0,
        link_primeiro_acesso: linkPrimeiroAcesso,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_user_from_colaborador") {
      const { colaborador_id, tipo, departamento_id, unidade_id, template_id } = body;

      if (!colaborador_id || !tipo || !unidade_id) {
        return new Response(JSON.stringify({ error: "colaborador_id, tipo e unidade_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tipo !== "clt" && tipo !== "pj") {
        return new Response(JSON.stringify({ error: "tipo deve ser 'clt' ou 'pj'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[create_user_from_colaborador] Start. colaborador_id=${colaborador_id}, tipo=${tipo}, unidade_id=${unidade_id}, departamento_id=${departamento_id || "null"}, template_id=${template_id || "derivar"}`);

      // 1. Buscar dados do colaborador
      const tabela = tipo === "clt" ? "colaboradores_clt" : "contratos_pj";
      const selectFields = tipo === "clt"
        ? "id, nome_completo, email_pessoal, email_corporativo, cargo_id"
        : "id, contato_nome, contato_email, email_pessoal, email_corporativo, cargo_id";

      const { data: colab, error: errColab } = await adminClient
        .from(tabela)
        .select(selectFields)
        .eq("id", colaborador_id)
        .single();

      if (errColab || !colab) {
        console.error("[create_user_from_colaborador] Colaborador não encontrado:", errColab);
        return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const full_name = tipo === "clt" ? (colab as any).nome_completo : (colab as any).contato_nome;
      const emailCorporativo = (colab as any).email_corporativo;
      const emailPessoal = (colab as any).email_pessoal || (tipo === "pj" ? (colab as any).contato_email : null) || null;

      if (!emailCorporativo) {
        return new Response(JSON.stringify({
          error: "Email corporativo não cadastrado. Edite o colaborador e informe email_corporativo antes de criar acesso."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validar domínio corporativo
      const { data: validacao, error: errValidacao } = await adminClient.rpc("validar_email_corporativo", {
        _email: emailCorporativo,
      });
      if (errValidacao || !(validacao as any)?.valido) {
        return new Response(JSON.stringify({
          error: `Email corporativo inválido: ${(validacao as any)?.motivo || "domínio não permitido"}. Verifique /parametros.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = emailCorporativo;

      // 2. Resolver template
      // Prioridade: template_id explícito > template_sugerido_para_cargo > fallback "analista"
      let templateToApply: string | null = template_id || null;
      if (!templateToApply && (colab as any).cargo_id) {
        try {
          const { data: templRpc, error: errTempl } = await adminClient.rpc("template_sugerido_para_cargo", {
            _cargo_id: (colab as any).cargo_id,
          });
          if (errTempl) {
            console.error("[create_user_from_colaborador] Erro ao sugerir template por cargo:", errTempl);
          } else {
            templateToApply = templRpc as string | null;
          }
        } catch (e) {
          console.error("[create_user_from_colaborador] Exception ao sugerir template:", e);
        }
      }

      // Fallback final: usar template "analista" do sistema
      if (!templateToApply) {
        console.log(`[create_user_from_colaborador] cargo_id ausente ou sem template mapeado, usando fallback 'analista'. colab_id=${colaborador_id}, tipo=${tipo}`);
        const { data: fallback } = await adminClient
          .from("cargo_template")
          .select("id")
          .eq("codigo", "analista")
          .eq("is_sistema", true)
          .single();
        templateToApply = (fallback as any)?.id || null;
      }

      if (!templateToApply) {
        console.error("[create_user_from_colaborador] Template 'analista' de fallback não encontrado no banco.");
        return new Response(JSON.stringify({
          error: "Template 'analista' de fallback não foi encontrado no banco. Contate o administrador."
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. Criar auth user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const novoUserId = newUser.user.id;

      // 4. Criar profile
      await adminClient.from("profiles").upsert({
        user_id: novoUserId,
        full_name,
        approved: true,
        colaborador_tipo: tipo,
      }, { onConflict: "user_id" });

      // 5. Vincular colaborador ao user
      await adminClient.from(tabela)
        .update({ user_id: novoUserId })
        .eq("id", colaborador_id);

      // 6. Aplicar template v3 (deriva perfil de área do departamento)
      const { error: errTemplate } = await adminClient.rpc("aplicar_template_cargo_v3", {
        _user_id: novoUserId,
        _template_id: templateToApply,
        _departamento_id: departamento_id || null,
        _unidade_id: unidade_id,
        _atribuidor: callerId || null,
      });

      if (errTemplate) {
        console.error("[create_user_from_colaborador] Erro ao aplicar template v3:", errTemplate);
      }

      // 7. Gerar link de recuperação (primeiro acesso)
      try {
        await adminClient.auth.admin.generateLink({ type: "recovery", email });
      } catch (e) {
        console.error("[create_user_from_colaborador] Erro ao gerar link de recuperação:", e);
      }

      // 8. E-mail de boas-vindas (corporativo) — Doutrina #15
      try {
        const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
          templateName: "boas-vindas-portal",
          recipientEmail: emailCorporativo,
          idempotencyKey: `boas-vindas-${novoUserId}-${Date.now()}`,
          templateData: {
            nome: full_name,
            email_corporativo: emailCorporativo,
            email_pessoal: emailPessoal,
            link: Deno.env.get("SITE_URL") || "https://sncf.lovable.app",
          },
        });
        if (!r.ok) {
          console.error("[create_user_from_colaborador] Falha em send-transactional-email (corporativo):", r.status, r.body);
        }
      } catch (e) {
        console.error("[create_user_from_colaborador] Erro ao enviar e-mail de boas-vindas:", e);
      }

      // 8b. Aviso ao email pessoal (se houver e for diferente do corporativo)
      if (emailPessoal && emailPessoal.toLowerCase() !== emailCorporativo.toLowerCase()) {
        try {
          const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
            templateName: "aviso-email-pessoal",
            recipientEmail: emailPessoal,
            idempotencyKey: `aviso-pessoal-${novoUserId}-${Date.now()}`,
            templateData: {
              nome: full_name,
              email_corporativo: emailCorporativo,
            },
          });
          if (!r.ok) {
            console.error("[create_user_from_colaborador] Falha em send-transactional-email (pessoal):", r.status, r.body);
          }
        } catch (e) {
          console.error("[create_user_from_colaborador] Aviso email pessoal falhou:", e);
        }
      }

      console.log(`[create_user_from_colaborador] Success. user_id=${novoUserId}, template_aplicado=${templateToApply}, perfil_aplicado=${errTemplate ? "FALHOU" : "OK"}`);

      return new Response(JSON.stringify({
        success: true,
        user_id: novoUserId,
        template_aplicado: templateToApply,
        aviso_template: errTemplate ? errTemplate.message : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =====================================================================
    // create_user_from_vinculo — modelo NOVO (pessoas/vinculos).
    // Aceita os 4 tipos_vinculo (CLT, PJ, PRESTADOR, SOCIO).
    // Degradação suave: configuração incompleta (sem cargo/departamento)
    // gera AVISO, nunca impede a criação do acesso.
    // =====================================================================
    if (action === "create_user_from_vinculo") {
      const { vinculo_id, enviar_email } = body;
      const avisos: string[] = [];
      const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

      if (!vinculo_id) {
        return new Response(JSON.stringify({ error: "vinculo_id é obrigatório" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      // 2. Ler vínculo + pessoa (FK explícita: pessoas tem mais de um caminho)
      const { data: vinculo, error: errVinculo } = await adminClient
        .from("vinculos")
        .select(
          "id, pessoa_id, tipo_vinculo, status, cargo_id, departamento_id, unidade_id, email_corporativo, usuario_id, pessoa:pessoas!vinculos_pessoa_id_fkey ( nome_completo, foto_url )",
        )
        .eq("id", vinculo_id)
        .maybeSingle();

      if (errVinculo) {
        console.error("[create_user_from_vinculo] Erro ao ler vínculo:", errVinculo);
        return new Response(JSON.stringify({ error: errVinculo.message }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      if (!vinculo) {
        return new Response(JSON.stringify({ error: "Vínculo não encontrado." }), {
          status: 404,
          headers: jsonHeaders,
        });
      }

      const v = vinculo as any;
      const pessoa = Array.isArray(v.pessoa) ? v.pessoa[0] : v.pessoa;
      const fullName = pessoa?.nome_completo || "Colaborador";

      if (v.status !== "ativo") {
        return new Response(JSON.stringify({
          error: `Vínculo não está ativo (status atual: ${v.status ?? "desconhecido"}). Ative o vínculo antes de criar o acesso.`,
        }), { status: 400, headers: jsonHeaders });
      }

      // 3. Guardas
      if (v.usuario_id) {
        return new Response(JSON.stringify({ error: "Esta pessoa já tem acesso." }), {
          status: 409,
          headers: jsonHeaders,
        });
      }

      const emailCorp: string | null = v.email_corporativo
        ? String(v.email_corporativo).trim().toLowerCase()
        : null;

      if (!emailCorp) {
        return new Response(JSON.stringify({
          error: "Vínculo sem e-mail corporativo. Informe o e-mail corporativo na ficha antes de criar o acesso.",
        }), { status: 400, headers: jsonHeaders });
      }

      // e-mail já usado em auth.users?
      let emailEmUso: { id: string } | null = null;
      try {
        const { data: lista } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const achado = lista?.users?.find((u: any) => u.email?.toLowerCase() === emailCorp);
        emailEmUso = achado ? { id: achado.id } : null;
      } catch (e) {
        console.error("[create_user_from_vinculo] Erro ao listar usuários:", e);
      }

      if (emailEmUso) {
        let quem = "outro usuário";
        const { data: outro } = await adminClient
          .from("vinculos")
          .select("pessoa:pessoas!vinculos_pessoa_id_fkey ( nome_completo )")
          .eq("usuario_id", emailEmUso.id)
          .limit(1);
        const outroPessoa = (outro as any[] | null)?.[0]?.pessoa;
        const nomeOutro = Array.isArray(outroPessoa) ? outroPessoa[0]?.nome_completo : outroPessoa?.nome_completo;
        if (nomeOutro) quem = nomeOutro;
        return new Response(JSON.stringify({
          error: `O e-mail ${emailCorp} já está em uso por ${quem}.`,
        }), { status: 409, headers: jsonHeaders });
      }

      // 4. Validar domínio corporativo (domínios vivem em `parametros`)
      const { data: validacao, error: errValidacao } = await adminClient.rpc("validar_email_corporativo", {
        _email: emailCorp,
      });
      if (errValidacao) {
        console.error("[create_user_from_vinculo] Erro em validar_email_corporativo:", errValidacao);
        return new Response(JSON.stringify({ error: errValidacao.message }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      if (!(validacao as any)?.valido) {
        return new Response(JSON.stringify({
          error: `E-mail corporativo inválido: ${(validacao as any)?.motivo || "domínio não permitido"}.`,
        }), { status: 400, headers: jsonHeaders });
      }

      // 5. Sem restrição por tipo_vinculo — CLT, PJ, PRESTADOR e SOCIO passam.
      console.log(`[create_user_from_vinculo] Start. vinculo_id=${vinculo_id}, tipo_vinculo=${v.tipo_vinculo}, cargo=${v.cargo_id || "null"}, depto=${v.departamento_id || "null"}, unidade=${v.unidade_id || "null"}`);

      // 6. Criar auth user com senha temporária aleatória
      const tempBytes = new Uint8Array(24);
      crypto.getRandomValues(tempBytes);
      const senhaTemporaria = Array.from(tempBytes, (b) => b.toString(16).padStart(2, "0")).join("") + "!Aa1";

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: emailCorp,
        password: senhaTemporaria,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !newUser?.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Falha ao criar o usuário" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const novoUserId = newUser.user.id;

      // 7. Profile
      const { error: errProfile } = await adminClient.from("profiles").upsert({
        user_id: novoUserId,
        full_name: fullName,
        avatar_url: pessoa?.foto_url ?? null,
        approved: true,
        tipo_usuario: "COLABORADOR",
      }, { onConflict: "user_id" });
      if (errProfile) {
        console.error("[create_user_from_vinculo] Erro ao gravar profile:", errProfile);
        avisos.push("Perfil de usuário gravado parcialmente: " + errProfile.message);
      }

      // 8. Ligar o vínculo — se falhar, apaga o auth user (não deixa órfão)
      const { error: errLink } = await adminClient
        .from("vinculos")
        .update({ usuario_id: novoUserId })
        .eq("id", vinculo_id);

      if (errLink) {
        console.error("[create_user_from_vinculo] Falha ao ligar vínculo, revertendo usuário:", errLink);
        await adminClient.from("profiles").delete().eq("user_id", novoUserId);
        await adminClient.auth.admin.deleteUser(novoUserId);
        return new Response(JSON.stringify({
          error: `Não foi possível ligar o acesso ao vínculo: ${errLink.message}`,
        }), { status: 400, headers: jsonHeaders });
      }

      // 9. Papel base
      // Índice de unicidade em user_roles é parcial (WHERE revogado_em IS NULL),
      // então ON CONFLICT não casa. Consultamos primeiro, inserimos só se faltar
      // e confirmamos depois.
      let papelBaseConfirmado = false;
      try {
        const { data: papelExistente, error: errBusca } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", novoUserId)
          .eq("role", "colaborador")
          .is("revogado_em", null)
          .maybeSingle();
        if (errBusca) {
          console.error("[create_user_from_vinculo] Erro ao verificar papel base:", errBusca);
          avisos.push("Papel base 'colaborador' não pôde ser atribuído: " + errBusca.message);
        } else if (papelExistente) {
          papelBaseConfirmado = true;
        } else {
          const { error: errInsert } = await adminClient.from("user_roles").insert({
            user_id: novoUserId,
            role: "colaborador",
          });
          if (errInsert) {
            console.error("[create_user_from_vinculo] Erro ao inserir papel base:", errInsert);
            avisos.push("Papel base 'colaborador' não pôde ser atribuído: " + errInsert.message);
          } else {
            const { data: papelConfirmado, error: errConfirma } = await adminClient
              .from("user_roles")
              .select("id")
              .eq("user_id", novoUserId)
              .eq("role", "colaborador")
              .is("revogado_em", null)
              .maybeSingle();
            if (errConfirma) {
              console.error("[create_user_from_vinculo] Erro ao confirmar papel base:", errConfirma);
              avisos.push("Papel base 'colaborador' não pôde ser atribuído: " + errConfirma.message);
            } else if (papelConfirmado) {
              papelBaseConfirmado = true;
            } else {
              avisos.push("Papel base 'colaborador' não pôde ser atribuído: inserção não confirmada.");
            }
          }
        }
      } catch (e) {
        console.error("[create_user_from_vinculo] Exception ao atribuir papel base:", e);
        avisos.push("Papel base 'colaborador' não pôde ser atribuído: " + ((e as Error)?.message || "erro desconhecido"));
      }

      // 10. Perfis via template do cargo — degradação suave
      if (!v.cargo_id) {
        avisos.push("Vínculo sem cargo: nenhum perfil aplicado.");
      } else {
        let templateId: string | null = null;
        try {
          const { data: templRpc, error: errTempl } = await adminClient.rpc("template_sugerido_para_cargo", {
            _cargo_id: v.cargo_id,
          });
          if (errTempl) {
            console.error("[create_user_from_vinculo] Erro ao sugerir template:", errTempl);
          } else {
            templateId = (templRpc as string | null) ?? null;
          }
        } catch (e) {
          console.error("[create_user_from_vinculo] Exception ao sugerir template:", e);
        }

        if (!templateId) {
          avisos.push("Cargo sem template de perfis mapeado: nenhum perfil aplicado.");
        } else {
          if (!v.departamento_id) {
            avisos.push("Vínculo sem departamento: nenhum perfil de área aplicado.");
          }
          try {
            const { error: errTemplateApply } = await adminClient.rpc("aplicar_template_cargo_v3", {
              _user_id: novoUserId,
              _template_id: templateId,
              _departamento_id: v.departamento_id || null,
              _unidade_id: v.unidade_id || null,
              _atribuidor: callerId || null,
            });
            if (errTemplateApply) {
              console.error("[create_user_from_vinculo] Falha ao aplicar template (usuário mantido):", errTemplateApply);
              avisos.push("Perfis não aplicados: " + errTemplateApply.message);
            }
          } catch (e) {
            console.error("[create_user_from_vinculo] Exception ao aplicar template (usuário mantido):", e);
            avisos.push("Perfis não aplicados: " + ((e as Error)?.message || "erro desconhecido"));
          }
        }
      }

      // 12. Link de primeiro acesso + e-mail de boas-vindas (nunca derruba a criação)
      let linkPrimeiroAcesso: string | null = null;
      try {
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: emailCorp,
        });
        if (linkErr) {
          console.error("[create_user_from_vinculo] Erro ao gerar link de recuperação:", linkErr);
          avisos.push("Link de primeiro acesso não foi gerado.");
        } else {
          linkPrimeiroAcesso = linkData?.properties?.action_link ?? null;
        }
      } catch (e) {
        console.error("[create_user_from_vinculo] Exception ao gerar link:", e);
        avisos.push("Link de primeiro acesso não foi gerado.");
      }

      if (enviar_email !== false) {
        try {
          const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
            templateName: "boas-vindas-portal",
            recipientEmail: emailCorp,
            idempotencyKey: `boas-vindas-${novoUserId}-${Date.now()}`,
            templateData: {
              nome: fullName,
              email_corporativo: emailCorp,
              link: linkPrimeiroAcesso || Deno.env.get("SITE_URL") || "https://sncf.lovable.app",
            },
          });
          if (!r.ok) {
            console.error("[create_user_from_vinculo] Falha em send-transactional-email:", r.status, r.body);
            avisos.push("E-mail de boas-vindas não foi enviado. Use o link de primeiro acesso.");
          }
        } catch (e) {
          console.error("[create_user_from_vinculo] Erro ao enviar e-mail de boas-vindas:", e);
          avisos.push("E-mail de boas-vindas não foi enviado. Use o link de primeiro acesso.");
        }
      }

      console.log(`[create_user_from_vinculo] Success. user_id=${novoUserId}, avisos=${avisos.length}`);

      return new Response(JSON.stringify({
        success: true,
        user_id: novoUserId,
        vinculo_id,
        email: emailCorp,
        tipo_vinculo: v.tipo_vinculo,
        link_primeiro_acesso: linkPrimeiroAcesso,
        avisos,
      }), { headers: jsonHeaders });
    }



    if (action === "toggle_ban") {
      const { user_id, ban } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (ban) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h",
        });
        if (error) throw error;
        await adminClient.from("profiles").update({ approved: false }).eq("user_id", user_id);
      } else {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
        if (error) throw error;
        await adminClient.from("profiles").update({ approved: true }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_roles") {
      const { user_id, roles, colaborador_tipo } = body;
      if (!user_id || !roles) {
        return new Response(JSON.stringify({ error: "user_id e roles são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // admin_rh cannot assign super_admin
      if (!isSuperAdmin && roles.includes("super_admin")) {
        return new Response(JSON.stringify({ error: "Sem permissão para atribuir super_admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      if (roles.length > 0) {
        const roleInserts = roles.map((role: string) => ({ user_id, role }));
        await adminClient.from("user_roles").insert(roleInserts);
      }

      // Update colaborador_tipo on profile
      if (colaborador_tipo !== undefined) {
        await adminClient.from("profiles").update({ colaborador_tipo: colaborador_tipo || null }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "approve") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("profiles").update({ approved: true }).eq("user_id", user_id);


      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "link_record") {
      const { user_id, colaborador_id, contrato_pj_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (colaborador_id) {
        await adminClient.from("colaboradores_clt").update({ user_id }).eq("id", colaborador_id);
      }
      if (contrato_pj_id) {
        await adminClient.from("contratos_pj").update({ user_id }).eq("id", contrato_pj_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unlink_record") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("colaboradores_clt").update({ user_id: null }).eq("user_id", user_id);
      await adminClient.from("contratos_pj").update({ user_id: null }).eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      // Only super_admin can delete
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Apenas Super Admin pode deletar usuários" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Não é possível deletar seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Limpa vínculos NÃO-cascade que bloqueariam o delete de auth.users
      // (FKs sem ON DELETE CASCADE / SET NULL apontando pra auth.users)
      await adminClient.from("colaboradores_clt").update({ user_id: null }).eq("user_id", user_id);
      await adminClient.from("contratos_pj").update({ user_id: null }).eq("user_id", user_id);
      await adminClient.from("grupo_acesso_usuarios").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);

      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) {
        console.error("[delete_user] deleteUser falhou:", error);
        return new Response(
          JSON.stringify({
            error:
              "Não foi possível excluir o usuário porque ele ainda está vinculado a registros do sistema (ex.: pedidos, processos, auditoria). Use 'Inativar acesso' em vez de excluir.",
            detail: error.message,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reenviar_link_acesso") {
      const { user_id: target_user_id, motivo } = body;

      if (!target_user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(
        `[reenviar_link_acesso] Start. target_user_id=${target_user_id}, motivo=${motivo || "(sem motivo)"}, actor=${callerId}`,
      );

      // 1. Buscar auth user
      const { data: userRecord, error: errUser } = await adminClient.auth.admin.getUserById(target_user_id);
      if (errUser || !userRecord?.user) {
        console.error("[reenviar_link_acesso] User não encontrado:", errUser);
        return new Response(JSON.stringify({ error: "Usuário não encontrado no Auth." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetEmail = userRecord.user.email;
      if (!targetEmail) {
        return new Response(JSON.stringify({ error: "Usuário sem email no Auth." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Buscar profile para saber se é primeiro acesso ou reset
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name, acesso_ativado_em")
        .eq("user_id", target_user_id)
        .maybeSingle();

      const ehPrimeiroAcesso = !(profile as any)?.acesso_ativado_em;
      const nome = (profile as any)?.full_name || targetEmail;

      // 3. Gerar novo link de recovery
      let linkPrimeiroAcesso: string | null = null;
      try {
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetEmail,
        });
        if (linkErr) {
          console.error("[reenviar_link_acesso] Erro ao gerar link:", linkErr);
          return new Response(JSON.stringify({ error: "Falha ao gerar link. Tente novamente." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        linkPrimeiroAcesso = linkData?.properties?.action_link ?? null;
      } catch (e) {
        console.error("[reenviar_link_acesso] Erro ao gerar link:", e);
        return new Response(JSON.stringify({ error: "Falha ao gerar link. Tente novamente." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Escolher template
      const templateName = ehPrimeiroAcesso ? "boas-vindas-portal" : "recuperacao-senha";
      const link = Deno.env.get("SITE_URL") || "https://sncf.lovable.app";

      try {
        const r = await invokeSendTransactionalEmail(supabaseUrl, anonKey, authHeader, {
          templateName,
          recipientEmail: targetEmail,
          idempotencyKey: `reenvio-${target_user_id}-${Date.now()}`,
          templateData: {
            nome,
            email_corporativo: targetEmail,
            link,
          },
        });
        if (!r.ok) {
          console.error("[reenviar_link_acesso] Falha em send-transactional-email:", r.status, r.body);
        }
      } catch (e) {
        console.error("[reenviar_link_acesso] Falha ao enviar email:", e);
      }

      // 5. Log de auditoria
      try {
        const { data: actorProfile } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("user_id", callerId)
          .maybeSingle();

        await adminClient.from("acesso_dados_log").insert({
          user_id: callerId,
          user_nome: (actorProfile as any)?.full_name || null,
          alvo_user_id: target_user_id,
          alvo_nome: nome,
          tipo_dado: "acesso_reenviado",
          tabela_origem: "auth",
          contexto: ehPrimeiroAcesso ? "primeiro_acesso" : "reset_senha",
          justificativa: motivo || null,
        } as any);
      } catch (e) {
        console.error("[reenviar_link_acesso] Falha ao registrar log:", e);
      }

      console.log(
        `[reenviar_link_acesso] Success. tipo=${templateName}, email=${targetEmail}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          tipo: ehPrimeiroAcesso ? "primeiro_acesso" : "reset_senha",
          email: targetEmail,
          link_primeiro_acesso: linkPrimeiroAcesso,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "list_users") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;

      const userList = users.map((u) => ({
        id: u.id,
        email: u.email,
        banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      return new Response(JSON.stringify({ users: userList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "definir_senha") {
      const { user_id, password } = body;
      if (!user_id || !password || password.length < 8) {
        return new Response(
          JSON.stringify({ error: "user_id e senha (mín. 8 chars) obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
