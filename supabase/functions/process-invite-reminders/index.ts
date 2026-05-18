import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data: convites, error: fetchErr } = await supabase
      .from("convites_cadastro")
      .select("*")
      .in("status", ["email_enviado", "pendente"]);

    if (fetchErr) throw fetchErr;

    for (const convite of convites || []) {
      const createdAt = new Date(convite.created_at);
      const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const appLink = `https://sncf.lovable.app/cadastro/${convite.token}`;

      if (convite.lembretes_ativos === false) {
        // Skip reminders for this invite — suspended by HR
      } else {
        if (daysSince === 3) await sendReminder(supabase, convite, appLink, now, "d3", false);
        if (daysSince === 7) await sendReminder(supabase, convite, appLink, now, "d7", false);
        if (daysSince === 14) await sendReminder(supabase, convite, appLink, now, "d14", true);
      }

      if (daysSince === 90) {
        const { data: existing } = await supabase
          .from("notificacoes_rh")
          .select("id")
          .eq("tipo", "convite_retencao_lgpd")
          .eq("link", `/convites-cadastro/${convite.id}`)
          .maybeSingle();

        if (!existing) {
          await supabase.from("notificacoes_rh").insert({
            tipo: "convite_retencao_lgpd",
            titulo: `Retenção LGPD: ${convite.nome}`,
            mensagem: `O convite de ${convite.nome} está pendente há 90 dias. Conforme política LGPD, decida se mantém ou cancela o convite.`,
            link: `/convites-cadastro/${convite.id}`,
            user_id: convite.criado_por,
          });
        }
      }
    }

    const { data: alertas } = await supabase
      .from("alertas_agendados")
      .select("*")
      .eq("executado", false)
      .lte("data_alerta", today);

    for (const alerta of alertas || []) {
      await supabase.from("notificacoes_rh").insert({
        tipo: alerta.tipo,
        titulo: alerta.titulo,
        mensagem: alerta.mensagem,
        link: alerta.link,
        user_id: alerta.user_id,
      });
      await supabase.from("alertas_agendados").update({ executado: true, executado_em: now.toISOString() }).eq("id", alerta.id);
    }

    let onboardingUpdated = 0;
    const { data: overdueTarefas } = await supabase
      .from("onboarding_tarefas")
      .select("id, titulo, checklist_id, responsavel_user_id")
      .eq("status", "pendente")
      .lt("prazo_data", today);

    for (const tarefa of overdueTarefas || []) {
      await supabase.from("onboarding_tarefas").update({ status: "atrasada" }).eq("id", tarefa.id);
      if (tarefa.responsavel_user_id) {
        await supabase.from("notificacoes_rh").insert({
          tipo: "onboarding_tarefa_atrasada",
          titulo: "Tarefa de onboarding atrasada",
          mensagem: `A tarefa "${tarefa.titulo}" está atrasada.`,
          link: "/onboarding",
          user_id: tarefa.responsavel_user_id,
        });
      }
      onboardingUpdated++;
    }

    return new Response(
      JSON.stringify({ ok: true, convites_processed: (convites || []).length, alertas_processed: (alertas || []).length, onboarding_updated: onboardingUpdated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getOrCreateUnsubToken(supabase: any, email: string): Promise<string> {
  const emailLower = email.toLowerCase();
  const { data: existing } = await supabase.from("email_unsubscribe_tokens").select("token").eq("email", emailLower).maybeSingle();
  if (existing?.token) return existing.token;
  const token = crypto.randomUUID();
  await supabase.from("email_unsubscribe_tokens").insert({ token, email: emailLower });
  return token;
}

async function sendReminder(supabase: any, convite: any, link: string, now: Date, tag: string, urgent: boolean) {
  const idempotencyKey = `reminder-${tag}-${convite.id}`;
  const { data: existing } = await supabase.from("email_send_log").select("id").eq("message_id", idempotencyKey).maybeSingle();
  if (existing) return;

  const nome = convite.nome || "Colaborador";
  const title = urgent ? "Seu cadastro ainda está pendente" : "Lembrete: sua ficha de cadastro está pendente";
  const body = urgent
    ? `Olá, ${nome}! Já faz um tempo que enviamos o link para preencher seu cadastro na Fetely e ainda não recebemos. Precisa de ajuda? Responda este e-mail ou clique abaixo para preencher.`
    : `Olá, ${nome}! Sua ficha de pré-cadastro na Fetely ainda está pendente. Por favor, preencha clicando no botão abaixo.`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="background-color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;"><div style="max-width:560px;margin:0 auto;padding:30px 25px;"><div style="margin-bottom:24px;"><span style="font-size:20px;font-weight:bold;color:#1a3a5c;">Fetély.</span><span style="font-size:12px;color:#999;margin-left:8px;">Gestão de Pessoas</span></div><h1 style="font-size:22px;font-weight:bold;color:#1a3a5c;margin:0 0 20px;">${title}</h1><p style="font-size:15px;color:#3a3a4a;line-height:1.6;margin:0 0 16px;">${body}</p><a href="${link}" style="display:inline-block;background-color:#1a3a5c;color:#ffffff;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:bold;text-decoration:none;margin:8px 0 24px;">Preencher minha ficha</a><hr style="border-color:#e5e7eb;margin:24px 0;"/><p style="font-size:12px;color:#999999;margin:0;">Fetely · Gestão de Pessoas</p></div></body></html>`;
  const plain = `${title}\n\n${body}\n\nAcesse: ${link}\n\nFetely People`;

  const unsubToken = await getOrCreateUnsubToken(supabase, convite.email);

  await supabase.from("email_send_log").insert({
    message_id: idempotencyKey,
    template_name: urgent ? "lembrete-cadastro-urgente" : "lembrete-cadastro",
    recipient_email: convite.email.toLowerCase(),
    status: "pending",
  });

  await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: idempotencyKey,
      to: convite.email.toLowerCase(),
      from: "Fetely People <noreply@notify.fetelycorp.com.br>",
      sender_domain: "notify.fetelycorp.com.br",
      subject: title,
      html,
      text: plain,
      purpose: "transactional",
      label: urgent ? "lembrete-cadastro-urgente" : "lembrete-cadastro",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubToken,
      queued_at: now.toISOString(),
    },
  });
}
