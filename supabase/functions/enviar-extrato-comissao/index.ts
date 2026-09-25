// Envia o extrato mensal de comissão fechado ao representante (Lei 4.886/1965),
// pedindo a NF de serviço (ou RPA) com link pessoal para o portal.
// Aceita { extrato_ids: [...] } (lote) ou { extrato_id } (compatibilidade).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { RESEND_FROM_ADDRESS, sendResendEmail } from '../_shared/resend-send.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_NAME = 'extrato-comissao'
// Mesma URL de entrada do link mágico (portal-representante/index.ts).
const PORTAL_URL = 'https://sncf.lovable.app/portal'
const TOMADOR = 'FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA'
const TOMADOR_CNPJ = '63.591.078/0001-48'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const brl = (v: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0) || 0)
const ymd = (v: unknown) => String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
const data = (v: unknown) => { const m = ymd(v); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
const diaMes = (v: unknown) => { const m = ymd(v); return m ? `${m[3]}/${m[2]}` : '—' }
const comp = (v: unknown) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : '—' }
// Prazo da NF: dia 10 do mês seguinte à competência (1º dia do mês seguinte + 9 dias).
function prazoNf(competencia: unknown): string {
  const m = String(competencia ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return '—'
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1 + 9))
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] || 'representante')

const ROTULO_ESTORNO: Record<string, string> = {
  nf_cancelada: 'NF cancelada',
  nf_substituida: 'NF substituída',
  devolucao: 'Devolução',
  titulo_revertido: 'Título revertido',
  correcao_manual: 'Correção manual',
}

function montarHtml(nome: string, e: any, link: string, expira: string) {
  const c = comp(e.competencia)
  const itens = Array.isArray(e.detalhe) ? e.detalhe : []
  const td = 'padding:6px;border-bottom:1px solid #eee'
  const linhas = itens.map((i: any) => {
    if (i?.tipo === 'estorno') {
      const rotulo = ROTULO_ESTORNO[String(i.estorno_tipo ?? '')] ?? String(i.estorno_tipo ?? 'Estorno')
      const parcial = i.parcial ? ' (parcial)' : ''
      return `<tr style="color:#b91c1c"><td style="${td}">${esc(rotulo + parcial)}</td><td style="${td}" colspan="3">Estorno: ${esc(i.motivo ?? '')}</td><td style="${td};text-align:right">${brl(i.valor)}</td></tr>`
    }
    return `<tr><td style="${td}">${esc(i.nf ?? '—')}</td><td style="${td}">${esc(i.pedido ?? '—')}</td><td style="${td}">${esc(i.parcela ?? '—')}</td><td style="${td}">${data(i.data_liquidacao)}</td><td style="${td};text-align:right">${brl(i.valor)}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="pt-BR"><body style="background:#ffffff;font-family:Arial,sans-serif;color:#222;margin:0">
<div style="max-width:640px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 4px">Fetély</h1>
<p style="margin:0 0 20px;color:#666">Extrato de comissão · competência ${c}</p>
<p>Olá, ${esc(primeiroNome(nome))}.</p>
<p>Seu extrato de comissão de ${c} está fechado. Para receber no dia ${diaMes(e.pagar_ate)}, emita a nota fiscal de serviço (ou RPA) e envie até ${prazoNf(e.competencia)}.</p>
<div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
<p style="margin:0;font-size:13px;color:#666">Valor exato a faturar</p>
<p style="margin:4px 0 0;font-size:30px;font-weight:bold">${brl(e.valor_total)}</p>
</div>
<h2 style="font-size:15px;margin:20px 0 8px">Dados para emissão</h2>
<table style="font-size:13px;border-collapse:collapse">
<tr><td style="padding:3px 12px 3px 0;color:#666">Tomador</td><td>${TOMADOR}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666">CNPJ</td><td>${TOMADOR_CNPJ}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666">Descrição sugerida</td><td>Serviços de representação comercial — comissão da competência ${c}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666">Valor</td><td>${brl(e.valor_total)}</td></tr>
</table>
<p style="margin:24px 0;text-align:center"><a href="${esc(link)}" style="background:#222;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;font-weight:bold">Enviar minha nota fiscal</a></p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
<thead><tr style="background:#f5f5f5;text-align:left"><th style="padding:6px">NF</th><th style="padding:6px">Pedido</th><th style="padding:6px">Parcela</th><th style="padding:6px">Data</th><th style="padding:6px;text-align:right">Valor</th></tr></thead>
<tbody>${linhas || '<tr><td colspan="5" style="padding:6px">Sem itens.</td></tr>'}</tbody>
<tfoot><tr><td colspan="4" style="padding:6px;font-weight:bold">Total</td><td style="padding:6px;text-align:right;font-weight:bold">${brl(e.valor_total)}</td></tr></tfoot>
</table>
<p style="margin-top:24px;font-size:12px;color:#666">A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. O pagamento ocorre até o dia 15 do mês subsequente, mediante nota fiscal de serviço (Lei 4.886/1965, art. 32). Dúvidas ou divergências podem ser contestadas pelo portal do representante.</p>
<p style="font-size:12px;color:#666">O link é pessoal e vale até ${expira}. Não compartilhe.</p>
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
      const subject = `Fetély · Extrato de comissão ${comp(e.competencia)} — emitir NF até ${prazoNf(e.competencia)}`
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
