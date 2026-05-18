import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permission (super_admin or admin_rh)
    const { data: isSuperAdmin } = await anonClient.rpc("has_role", { _user_id: caller.id, _role: "super_admin" });
    const { data: isAdminRh } = await anonClient.rpc("has_role", { _user_id: caller.id, _role: "admin_rh" });
    if (!isSuperAdmin && !isAdminRh) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // ---- ACTION: activate ----
    if (action === "activate") {
      const { email, nome, grupo_acesso_id, colaborador_id, contrato_pj_id, tipo } = body;

      if (!email || !nome) {
        return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get grupo_acesso role
      let roleAutomatico = "colaborador";
      if (grupo_acesso_id) {
        const { data: grupo } = await adminClient
          .from("grupos_acesso")
          .select("role_automatico")
          .eq("id", grupo_acesso_id)
          .single();
        if (grupo) roleAutomatico = grupo.role_automatico;
      }

      // Check if user already exists
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

      let userId: string;
      const tempPassword = generatePassword();

      if (existingUser) {
        userId = existingUser.id;
        // Reactivate if banned
        await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
        await adminClient.from("profiles").update({ approved: true }).eq("user_id", userId);
      } else {
        // Create new user
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: nome },
        });
        if (createError) {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = newUser.user.id;
        await adminClient.from("profiles").update({ approved: true }).eq("user_id", userId);
      }

      // Assign role
      await adminClient.from("user_roles").upsert(
        { user_id: userId, role: roleAutomatico, atribuido_manualmente: false },
        { onConflict: "user_id,role" }
      );

      // Set colaborador_tipo on profile
      const tipoColaborador = tipo === "pj" ? "pj" : "clt";
      await adminClient.from("profiles").update({ colaborador_tipo: tipoColaborador }).eq("user_id", userId);

      // Link to CLT/PJ record
      if (colaborador_id) {
        await adminClient.from("colaboradores_clt").update({ user_id: userId }).eq("id", colaborador_id);
      }
      if (contrato_pj_id) {
        await adminClient.from("contratos_pj").update({ user_id: userId }).eq("id", contrato_pj_id);
      }

      // Send welcome email with temporary password — Doutrina #15: forward JWT do user
      // (não usar adminClient.functions.invoke que envia service_role e quebra
      // o auth.getUser dentro de send-transactional-email)
      if (!existingUser) {
        try {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "apikey": anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              templateName: "boas-vindas-portal",
              recipientEmail: email,
              idempotencyKey: `boas-vindas-${userId}-${Date.now()}`,
              templateData: {
                nome,
                email,
                senha: tempPassword,
                link: "https://sncf.lovable.app",
              },
            }),
          });
          if (!sendResp.ok) {
            const errText = await sendResp.text();
            console.error("[create-portal-access] Falha em send-transactional-email:", sendResp.status, errText);
          }
        } catch (emailErr) {
          console.error("[create-portal-access] Erro ao enviar email de boas-vindas:", emailErr);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        user_id: userId,
        is_new_user: !existingUser,
        temp_password: !existingUser ? tempPassword : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: revoke ----
    if (action === "revoke") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ban user (disable, not delete)
      await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      await adminClient.from("profiles").update({ approved: false }).eq("user_id", user_id);

      // Record revocation timestamp
      await adminClient.from("user_roles").update({ revogado_em: new Date().toISOString() }).eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
