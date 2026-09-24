// Envia o extrato mensal de comissão fechado ao representante (Lei 4.886/1965).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { RESEND_FROM_ADDRESS, sendResendEmail } from '../_shared/resend-send.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_NAME = 'extrato-comissao'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const brl = (v: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0) || 0)
const data = (v: unknown) => {
  if (!v) return '—'
  const s = String(v); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}
const comp = (v: unknown) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : '—' }

function montarHtml(nome: string, e: any) {
  const ROTULO_ESTORNO: Record<string, string> = {
    nf_cancelada: 'NF cancelada',
    nf_substituida: 'NF substituída',
    devolucao: 'Devolução',
    titulo_revertido: 'Título revertido',
    correcao_manual: 'Correção manual',
  }
  const itens = Array.isArray(e.detalhe) ? e.detalhe : []
  const linhas = itens.map((i: any) => {
    if (i?.tipo === 'estorno') {
      const rotulo = ROTULO_ESTORNO[String(i.estorno_tipo ?? '')] ?? String(i.estorno_tipo ?? 'Estorno')
      const parcial = i.parcial ? ' (parcial)' : ''
      return `<tr style="color:#b91c1c"><td style="padding:6px;border-bottom:1px solid #eee">${esc(rotulo + parcial)}</td><td style="padding:6px;border-bottom:1px solid #eee" colspan="3">Estorno: ${esc(i.motivo ?? '')}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${brl(i.valor)}</td></tr>`
    }
    return `<tr><td style="padding:6px;border-bottom:1px solid #eee">${esc(i.nf ?? '—')}</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(i.pedido ?? '—')}</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(i.parcela ?? '—')}</td><td style="padding:6px;border-bottom:1px solid #eee">${data(i.data_liquidacao)}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${brl(i.valor)}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="pt-BR"><body style="background:#ffffff;font-family:Arial,sans-serif;color:#222;margin:0">
<div style="max-width:640px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 4px">Fetély</h1>
<p style="margin:0 0 20px;color:#666">Extrato de comissão · competência ${comp(e.competencia)}</p>
<p>Olá, ${esc(nome)}.</p>
<p>Valor total a receber: <strong>${brl(e.valor_total)}</strong><br/>Data limite de pagamento: <strong>${data(e.pagar_ate)}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="background:#f5f5f5;text-align:left"><th style="padding:6px">NF</th><th style="padding:6px">Pedido</th><th style="padding:6px">Parcela</th><th style="padding:6px">Data</th><th style="padding:6px;text-align:right">Valor</th></tr></thead>
<tbody>${linhas || '<tr><td colspan="5" style="padding:6px">Sem itens.</td></tr>'}</tbody>
<tfoot><tr><td colspan="4" style="padding:6px;font-weight:bold">Total</td><td style="padding:6px;text-align:right;font-weight:bold">${brl(e.valor_total)}</td></tr></tfoot>
</table>
<p style="margin-top:24px;font-size:12px;color:#666">A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. O pagamento ocorre até o dia 15 do mês subsequente, mediante nota fiscal de serviço (Lei 4.886/1965, art. 32). Dúvidas ou divergências podem ser contestadas pelo portal do representante.</p>
</div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Infra: SUPABASE_URL/SERVICE_ROLE_KEY ausentes' }, 500)
  const supabase = createClient(url, key)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u, error: ue } = await supabase.auth.getUser(token)
  if (ue || !u?.user) return json({ error: 'Não autenticado' }, 401)

  let extratoId = ''
  try { extratoId = String((await req.json())?.extrato_id ?? '') } catch { /* */ }
  if (!/^[0-9a-f-]{36}$/i.test(extratoId)) return json({ error: 'extrato_id inválido' }, 400)

  try {
    const { data: e, error } = await supabase.from('comissao_extrato').select('*').eq('id', extratoId).maybeSingle()
    if (error) throw new Error(`Leitura do extrato: ${error.message}`)
    if (!e) throw new Error('Extrato inexistente')
    const { data: v, error: ve } = await supabase.from('vendedores').select('nome_exibicao,email_contato').eq('id', e.vendedor_id).maybeSingle()
    if (ve) throw new Error(`Leitura do representante: ${ve.message}`)
    const email = (v?.email_contato ?? '').trim()
    if (!email || !email.includes('@')) throw new Error(`Representante ${v?.nome_exibicao ?? e.vendedor_id} sem e-mail de contato cadastrado`)

    const { data: apiKey, error: vaultErr } = await supabase.rpc('get_vault_secret', { p_name: 'RESEND_API_KEY' })
    if (vaultErr || !apiKey) throw new Error(`Vault: ${vaultErr?.message || 'RESEND_API_KEY ausente'}`)

    const html = montarHtml(v?.nome_exibicao ?? 'representante', e)
    const subject = `Fetély · Extrato de comissão ${comp(e.competencia)}`
    const messageId = crypto.randomUUID()
    const meta = { extrato_id: extratoId, por: u.user.id }
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
    console.log('[enviar-extrato-comissao] ok', extratoId, email)
    return json({ ok: true, enviado_para: email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[enviar-extrato-comissao]', msg)
    return json({ error: msg }, 500)
  }
})
