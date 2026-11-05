// Envia o extrato mensal de comissão fechado ao representante (Lei 4.886/1965),
// pedindo a NF de serviço (ou RPA) com link pessoal para o portal.
// Aceita { extrato_ids: [...] } (lote) ou { extrato_id } (compatibilidade).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { RESEND_FROM_ADDRESS, sendResendEmail } from '../_shared/resend-send.ts'
import { assunto, diaMes, montarHtml } from './email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_NAME = 'extrato-comissao'
// Mesma URL de entrada do link mágico (portal-representante/index.ts).
const PORTAL_URL = 'https://sncf.lovable.app/portal'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Infra: SUPABASE_URL/SERVICE_ROLE_KEY ausentes' }, 500)
  const supabase = createClient(url, key)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u, error: ue } = await supabase.auth.getUser(token)
  if (ue || !u?.user) return json({ error: 'Não autenticado' }, 401)

  let corpo: any = {}
  try { corpo = await req.json() } catch { /* */ }
  const ids: string[] = Array.isArray(corpo?.extrato_ids)
    ? corpo.extrato_ids.map((x: unknown) => String(x))
    : corpo?.extrato_id ? [String(corpo.extrato_id)] : []
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return json({ error: 'Informe extrato_ids (lista) ou extrato_id' }, 400)
  if (unicos.length > 200) return json({ error: 'Máximo de 200 extratos por lote' }, 400)
  const invalidos = unicos.filter((i) => !UUID.test(i))
  if (invalidos.length) return json({ error: `extrato_id inválido: ${invalidos.join(', ')}` }, 400)

  const { data: apiKey, error: vaultErr } = await supabase.rpc('get_vault_secret', { p_name: 'RESEND_API_KEY' })
  if (vaultErr || !apiKey) return json({ error: `Vault: ${vaultErr?.message || 'RESEND_API_KEY ausente'}` }, 500)

  let enviados = 0
  const falhas: Array<{ extrato_id: string; representante: string | null; erro: string }> = []
  const ignorados: Array<{ extrato_id: string; representante: string | null; motivo: string }> = []

  for (const extratoId of unicos) {
    let representante: string | null = null
    try {
      const { data: e, error } = await supabase.from('comissao_extrato').select('*').eq('id', extratoId).maybeSingle()
      if (error) throw new Error(`Leitura do extrato: ${error.message}`)
      if (!e) throw new Error('Extrato inexistente')
      const { data: v, error: ve } = await supabase.from('vendedores').select('nome_exibicao,email_contato').eq('id', e.vendedor_id).maybeSingle()
      if (ve) throw new Error(`Leitura do representante: ${ve.message}`)
      representante = v?.nome_exibicao ?? null

      if (Number(e.valor_total ?? 0) === 0) {
        ignorados.push({ extrato_id: extratoId, representante, motivo: 'ignorado: extrato zerado' })
        continue
      }
      const email = (v?.email_contato ?? '').trim()
      if (!email || !email.includes('@')) throw new Error(`Representante ${representante ?? e.vendedor_id} sem e-mail de contato cadastrado`)

      const { data: emitido, error: emErr } = await supabase.rpc('fn_portal_link_extrato_emitir', { p_extrato_id: extratoId })
      if (emErr) throw new Error(`fn_portal_link_extrato_emitir: ${emErr.message}`)
      const linkToken = (emitido as any)?.token
      if (!linkToken) throw new Error('fn_portal_link_extrato_emitir não devolveu token')
      const link = `${PORTAL_URL}?t=${encodeURIComponent(linkToken)}`
      const expiraRaw = (emitido as any)?.expira_em
      const expira = expiraRaw ? diaMes(new Date(expiraRaw).toISOString()) : diaMes(e.pagar_ate)

      const html = montarHtml(v?.nome_exibicao ?? 'representante', e, link, expira)
      const subject = assunto(e)
      const messageId = crypto.randomUUID()
      const meta = { extrato_id: extratoId, por: u.user.id, habilitou_portal: (emitido as any)?.habilitou_portal ?? null }
      await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'pending', metadata: meta })
      try {
        await sendResendEmail({ apiKey: apiKey as string, from: RESEND_FROM_ADDRESS, to: email, subject, html, idempotencyKey: messageId })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'failed', error_message: msg, metadata: meta })
        throw new Error(`Resend: ${msg}`)
      }
      await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'sent', metadata: meta })

      const { error: upErr } = await supabase.from('comissao_extrato').update({ enviado_em: new Date().toISOString(), enviado_para: email }).eq('id', extratoId)
      if (upErr) throw new Error(`E-mail enviado, mas falhou ao registrar o envio no extrato: ${upErr.message}`)
      enviados++
      console.log('[enviar-extrato-comissao] ok', extratoId, email)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[enviar-extrato-comissao]', extratoId, msg)
      falhas.push({ extrato_id: extratoId, representante, erro: msg })
    }
  }

  return json({ ok: falhas.length === 0, enviados, falhas, ignorados })
})
