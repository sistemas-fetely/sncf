// v3 — suporta template cobranca-pedido (bundle trigger)
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Resend via direct API. Credential lives in vault as 'RESEND_API_KEY' (Doutrina #77).
const SITE_NAME = 'Fetély'
const FROM_DOMAIN = 'notify.fetelycorp.com.br'
const FROM_ADDRESS = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`
const RESEND_API_URL = 'https://api.resend.com/emails'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    })
  }

  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let emailMetadata: Record<string, any> | null = null
  let attachments: Array<{ filename: string; content: string }> = []
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') templateData = body.templateData
    if (body.metadata && typeof body.metadata === 'object') emailMetadata = body.metadata
    let cc: string[] = []
    if (Array.isArray(body.cc) && body.cc.length > 0) {
      cc = body.cc.filter((e: any) => typeof e === 'string' && e.includes('@'))
    }
    if (Array.isArray(body.attachments)) {
      attachments = body.attachments.filter((a: any) =>
        a && typeof a.filename === 'string' && typeof a.content === 'string'
      )
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!templateName) {
    return new Response(JSON.stringify({ error: 'templateName is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    return new Response(
      JSON.stringify({ error: `Template '${templateName}' not found` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const effectiveRecipient = template.to || recipientEmail
  if (!effectiveRecipient) {
    return new Response(JSON.stringify({ error: 'recipientEmail is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Suppression check
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    return new Response(JSON.stringify({ error: 'Failed to verify suppression' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'suppressed', metadata: emailMetadata,
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Get/create unsubscribe token
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  const { data: existingToken } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    unsubscribeToken = generateToken()
    await supabase.from('email_unsubscribe_tokens').upsert(
      { token: unsubscribeToken, email: normalizedEmail },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token').eq('email', normalizedEmail).maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  } else {
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Fetch Resend API key from vault (Doutrina #77)
  const { data: resendApiKey, error: vaultError } = await supabase
    .rpc('get_vault_secret', { p_name: 'RESEND_API_KEY' })

  if (vaultError || !resendApiKey) {
    console.error('Failed to retrieve RESEND_API_KEY from vault', vaultError)
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'failed', metadata: emailMetadata,
      error_message: `Vault error: ${vaultError?.message || 'RESEND_API_KEY not found in vault'}`,
    })
    return new Response(
      JSON.stringify({ error: 'Resend credential not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Render templates
  const html = await renderAsync(React.createElement(template.component, templateData))
  const plainText = await renderAsync(
    React.createElement(template.component, templateData), { plainText: true },
  )
  const resolvedSubject = typeof template.subject === 'function'
    ? template.subject(templateData)
    : template.subject

  // Append simple unsubscribe footer
  const unsubscribeUrl = `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${unsubscribeToken}`
  const htmlWithFooter = html + `<hr/><p style="font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif;">Para deixar de receber estes e-mails, <a href="${unsubscribeUrl}">clique aqui</a>.</p>`
  const textWithFooter = plainText + `\n\nPara deixar de receber: ${unsubscribeUrl}`

  // Log pending
  await supabase.from('email_send_log').insert({
    message_id: messageId, template_name: templateName,
    recipient_email: effectiveRecipient, status: 'pending', metadata: emailMetadata,
  })

  // Send via Resend direct API
  try {
    const resp = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [effectiveRecipient],
        subject: resolvedSubject,
        html: htmlWithFooter,
        text: textWithFooter,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        ...(attachments.length > 0 && { attachments }),
      }),
    })

    const respJson = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      console.error('Resend send failed', { status: resp.status, body: respJson })
      await supabase.from('email_send_log').insert({
        message_id: messageId, template_name: templateName,
        recipient_email: effectiveRecipient, status: 'failed', metadata: emailMetadata,
        error_message: `Resend ${resp.status}: ${JSON.stringify(respJson)}`,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: respJson }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'sent', metadata: emailMetadata,
    })

    return new Response(
      JSON.stringify({ success: true, messageId: respJson?.id ?? messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Resend send exception', msg)
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName,
      recipient_email: effectiveRecipient, status: 'failed', metadata: emailMetadata,
      error_message: msg,
    })
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
