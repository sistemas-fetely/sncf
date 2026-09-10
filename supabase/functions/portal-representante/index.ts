// Porta de entrada ÚNICA do Portal do Representante.
//
// O representante não tem conta no Supabase Auth deste projeto: não fala com
// PostgREST, não alcança tabela nenhuma. Tudo passa por aqui, com SERVICE ROLE,
// chamando RPCs SECURITY DEFINER cujo EXECUTE foi revogado de anon/authenticated.
//
// NOTA de implementação (deliberada): o envio NÃO usa a edge
// `send-transactional-email` porque ela exige um JWT de usuário logado
// (auth.getUser no Bearer) — e quem chama esta função é anônimo. Usamos o mesmo
// registro de templates e o MESMO ponto único de envio (_shared/resend-send.ts),
// mantendo template, footer e log de envio no padrão do projeto.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { RESEND_FROM_ADDRESS, sendResendEmail } from '../_shared/resend-send.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PORTAL_URL = 'https://sncf.lovable.app/portal'
const TEMPLATE_NAME = 'portal-representante-link'

const MSG_SOLICITAR =
  'Se o e-mail estiver habilitado, você receberá um link de acesso em instantes.'
const MSG_ERRO_INFRA =
  'Não foi possível concluir a operação agora. Tente novamente em alguns instantes.'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function ipReal(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (!fwd) return null
  const primeiro = fwd.split(',')[0]?.trim()
  return primeiro || null
}

// Envia o link por e-mail. Lança em qualquer falha — nunca silencioso.
async function enviarLink(
  supabase: ReturnType<typeof createClient>,
  destinatario: string,
  nome: string | null,
  link: string,
) {
  const template = TEMPLATES[TEMPLATE_NAME]
  if (!template) throw new Error(`Template '${TEMPLATE_NAME}' não registrado`)

  const { data: resendApiKey, error: vaultError } = await supabase
    .rpc('get_vault_secret', { p_name: 'RESEND_API_KEY' })
  if (vaultError || !resendApiKey) {
    throw new Error(`Vault: ${vaultError?.message || 'RESEND_API_KEY ausente'}`)
  }

  const props = { nome: nome ?? undefined, link }
  const html = await renderAsync(React.createElement(template.component, props))
  const text = await renderAsync(
    React.createElement(template.component, props),
    { plainText: true },
  )
  const subject = typeof template.subject === 'function'
    ? template.subject(props as Record<string, unknown>)
    : template.subject

  const messageId = crypto.randomUUID()

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: destinatario,
    status: 'pending',
  })

  try {
    await sendResendEmail({
      apiKey: resendApiKey as string,
      from: RESEND_FROM_ADDRESS,
      to: destinatario,
      subject,
      html,
      text,
      idempotencyKey: messageId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: TEMPLATE_NAME,
      recipient_email: destinatario,
      status: 'failed',
      error_message: msg,
    })
    throw new Error(`Resend: ${msg}`)
  }

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: destinatario,
    status: 'sent',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[portal-representante] SUPABASE_URL/SERVICE_ROLE_KEY ausentes')
    return json({ ok: false, erro: MSG_ERRO_INFRA }, 500)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, erro: 'Corpo JSON inválido.' }, 400)
  }

  const acao = typeof body.acao === 'string' ? body.acao : ''
  const ip = ipReal(req)
  const ua = req.headers.get('user-agent') ?? null
  console.log('[portal-representante] acao=%s ip=%s ua=%s', acao, ip ?? '-', ua ?? '-')

  try {
    // ---------- solicitar ----------
    if (acao === 'solicitar') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email || !email.includes('@')) {
        return json({ ok: false, erro: 'Informe um e-mail válido.' }, 400)
      }

      const { data, error } = await supabase.rpc('fn_portal_link_solicitar', {
        p_email: email,
        p_ip: ip,
        p_ua: ua,
      })
      if (error) throw new Error(`fn_portal_link_solicitar: ${error.message}`)

      const r = (data ?? {}) as Record<string, unknown>
      if (r.enviado === true) {
        const token = typeof r.token === 'string' ? r.token : ''
        if (!token) throw new Error('fn_portal_link_solicitar retornou enviado=true sem token')
        const nome = typeof r.nome === 'string' ? r.nome : null
        // O token só existe aqui e dentro do e-mail. Nunca na resposta, nunca no log.
        await enviarLink(supabase, email, nome, `${PORTAL_URL}?t=${encodeURIComponent(token)}`)
      }

      // Resposta idêntica com ou sem envio: não revela quais e-mails existem.
      return json({ ok: true, mensagem: MSG_SOLICITAR })
    }

    // ---------- abrir ----------
    if (acao === 'abrir') {
      const token = typeof body.token === 'string' ? body.token : ''
      if (!token) return json({ ok: false, erro: 'Link de acesso inválido.' }, 400)

      const { data, error } = await supabase.rpc('fn_portal_sessao_abrir', {
        p_token: token,
        p_ip: ip,
        p_ua: ua,
      })
      if (error) throw new Error(`fn_portal_sessao_abrir: ${error.message}`)
      return json(data)
    }

    // ---------- painel ----------
    if (acao === 'painel') {
      const sessao = typeof body.sessao === 'string' ? body.sessao : ''
      if (!sessao) return json({ ok: false, erro: 'Sessão inválida.' }, 400)

      const { data, error } = await supabase.rpc('fn_portal_painel', { p_token: sessao })
      if (error) throw new Error(`fn_portal_painel: ${error.message}`)
      // O formato do JSON é o contrato: repassado inteiro, sem remodelar.
      return json(data)
    }

    // ---------- sair ----------
    if (acao === 'sair') {
      const sessao = typeof body.sessao === 'string' ? body.sessao : ''
      if (!sessao) return json({ ok: false, erro: 'Sessão inválida.' }, 400)

      const { data, error } = await supabase.rpc('fn_portal_sessao_encerrar', { p_token: sessao })
      if (error) throw new Error(`fn_portal_sessao_encerrar: ${error.message}`)
      return json(data)
    }

    return json({ ok: false, erro: 'Ação inválida.' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[portal-representante] falha acao=%s: %s', acao, msg)
    return json({ ok: false, erro: MSG_ERRO_INFRA }, 500)
  }
})
