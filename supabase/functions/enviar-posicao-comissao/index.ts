// Envia a POSIÇÃO de comissões (acompanhamento, sem pedido de NF) a quem não tem
// extrato na competência. Entrada: { vendedor_ids: [...], competencia: 'AAAA-MM-01' (mês de pagamento), force? }.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { RESEND_FROM_ADDRESS, sendResendEmail } from '../_shared/resend-send.ts'
import { assuntoPosicao, diaMes, montarHtmlPosicao } from './email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const TEMPLATE_NAME = 'posicao-comissao'
const PORTAL_URL = 'https://sncf.lovable.app/portal'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMP = /^\d{4}-\d{2}-01$/

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
  const ids = [...new Set((Array.isArray(corpo?.vendedor_ids) ? corpo.vendedor_ids : []).map((x: unknown) => String(x)))] as string[]
  const competencia = String(corpo?.competencia ?? '')
  const force = corpo?.force === true
  if (ids.length === 0) return json({ error: 'Informe vendedor_ids (lista)' }, 400)
  if (ids.length > 200) return json({ error: 'Máximo de 200 representantes por lote' }, 400)
  const invalidos = ids.filter((i) => !UUID.test(i))
  if (invalidos.length) return json({ error: `vendedor_id inválido: ${invalidos.join(', ')}` }, 400)
  if (!COMP.test(competencia)) return json({ error: 'competencia deve ser AAAA-MM-01 (mês de pagamento)' }, 400)

  const { data: apiKey, error: vaultErr } = await supabase.rpc('get_vault_secret', { p_name: 'RESEND_API_KEY' })
  if (vaultErr || !apiKey) return json({ error: `Vault: ${vaultErr?.message || 'RESEND_API_KEY ausente'}` }, 500)

  let enviados = 0
  const falhas: Array<{ vendedor_id: string; representante: string | null; erro: string }> = []
  const ignorados: Array<{ vendedor_id: string; representante: string | null; motivo: string }> = []

  for (const vendedorId of ids) {
    let representante: string | null = null
    try {
      const { data: p, error: pe } = await supabase.from('vw_comissao_posicao_viva').select('*').eq('vendedor_id', vendedorId).maybeSingle()
      if (pe) throw new Error(`Leitura da posição: ${pe.message}`)
      representante = (p as any)?.representante ?? null

      const { data: envio, error: ee } = await supabase.from('comissao_posicao_envio').select('enviado_em').eq('vendedor_id', vendedorId).eq('competencia', competencia).maybeSingle()
      if (ee) throw new Error(`Leitura do envio: ${ee.message}`)
      if (envio && !force) {
        ignorados.push({ vendedor_id: vendedorId, representante, motivo: `ignorado: posição já enviada em ${diaMes(String(envio.enviado_em))}` })
        continue
      }
      const { data: ext, error: xe } = await supabase.from('comissao_extrato').select('id').eq('vendedor_id', vendedorId).eq('competencia', competencia).gt('valor_total', 0).limit(1)
      if (xe) throw new Error(`Leitura do extrato: ${xe.message}`)
      if ((ext ?? []).length > 0) {
        ignorados.push({ vendedor_id: vendedorId, representante, motivo: 'ignorado: tem extrato nesta competência (vai pelo extrato)' })
        continue
      }
      if (!p) {
        ignorados.push({ vendedor_id: vendedorId, representante, motivo: 'ignorado: sem carteira viva' })
        continue
      }
      const email = String((p as any).email_contato ?? '').trim()
      if (!email || !email.includes('@')) throw new Error(`Representante ${representante ?? vendedorId} sem e-mail de contato cadastrado`)

      const { data: emitido, error: emErr } = await supabase.rpc('fn_portal_link_posicao_emitir', { p_vendedor_id: vendedorId, p_competencia: competencia })
      if (emErr) throw new Error(`fn_portal_link_posicao_emitir: ${emErr.message}`)
      const linkToken = (emitido as any)?.token
      if (!linkToken) throw new Error('fn_portal_link_posicao_emitir não devolveu token')
      const link = `${PORTAL_URL}?t=${encodeURIComponent(linkToken)}`
      const expira = (emitido as any)?.expira_em ? diaMes(new Date((emitido as any).expira_em).toISOString()) : '—'

      const html = montarHtmlPosicao(representante ?? 'representante', competencia, p as any, link, expira)
      const subject = assuntoPosicao(competencia)
      const messageId = crypto.randomUUID()
      const meta = { vendedor_id: vendedorId, competencia, por: u.user.id, force, habilitou_portal: (emitido as any)?.habilitou_portal ?? null }
      await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'pending', metadata: meta })
      try {
        await sendResendEmail({ apiKey: apiKey as string, from: RESEND_FROM_ADDRESS, to: email, subject, html, idempotencyKey: messageId })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'failed', error_message: msg, metadata: meta })
        throw new Error(`Resend: ${msg}`)
      }
      await supabase.from('email_send_log').insert({ message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: email, status: 'sent', metadata: meta })

      const q = p as any
      const resumo = {
        carteira_total: q.carteira_total, a_vencer: q.a_vencer, a_vencer_qtd: q.a_vencer_qtd,
        em_atraso: q.em_atraso, em_atraso_qtd: q.em_atraso_qtd, aguardando_extrato: q.aguardando_extrato,
        aguardando_extrato_qtd: q.aguardando_extrato_qtd, complementos: q.complementos, complementos_qtd: q.complementos_qtd,
        proximo_vencimento: q.proximo_vencimento,
      }
      const { error: upErr } = await supabase.from('comissao_posicao_envio').upsert({
        vendedor_id: vendedorId, competencia, enviado_em: new Date().toISOString(), enviado_para: email, enviado_por: u.user.id, resumo,
      }, { onConflict: 'vendedor_id,competencia' })
      if (upErr) throw new Error(`E-mail enviado, mas falhou ao registrar o envio da posição: ${upErr.message}`)
      enviados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[enviar-posicao-comissao]', vendedorId, msg)
      falhas.push({ vendedor_id: vendedorId, representante, erro: msg })
    }
  }
  return json({ ok: falhas.length === 0, enviados, falhas, ignorados })
})
