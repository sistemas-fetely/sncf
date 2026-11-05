// Montagem pura do e-mail de POSIÇÃO de comissões (sem I/O) — testada em src/.
// Posição = acompanhamento para quem não tem extrato na competência. Nunca pede NF.
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const brl = (v: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0) || 0)
export const diaMes = (v: unknown) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : '—' }
/** Mês anterior de uma competência AAAA-MM(-DD) → "MM/AAAA" (mês apurado). */
export function compAnterior(v: unknown): string {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return '—'
  const t = Number(m[1]) * 12 + (Number(m[2]) - 1) - 1
  return `${String((t % 12) + 1).padStart(2, '0')}/${Math.floor(t / 12)}`
}
export const primeiroNome = (n: string) => {
  const p = (n ?? '').trim().split(/\s+/)[0] || 'representante'
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')
}

const VERDE = '#1a3d2b'
const ROSA = '#F4A7B9'
const CREME = '#F5F0E8'
const VERMELHO = '#b91c1c'
const FONTE = "'Segoe UI', Arial, sans-serif"

export type Posicao = {
  a_vencer?: number | null; a_vencer_qtd?: number | null
  em_atraso?: number | null; em_atraso_qtd?: number | null
  aguardando_extrato?: number | null; aguardando_extrato_qtd?: number | null
  complementos?: number | null; complementos_qtd?: number | null
  proximo_vencimento?: string | null; carteira_total?: number | null
}

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0 }

/** Assunto: competência = mês APURADO (mês anterior ao de pagamento). */
export function assuntoPosicao(competenciaPagamento: unknown): string {
  return `Fetély · Posição de comissões ${compAnterior(competenciaPagamento)}`
}

/** Linhas (rótulo, valor, vermelho) — só as > 0. */
export function linhasPosicao(p: Posicao): Array<{ rotulo: string; valor: number; alerta: boolean }> {
  const out: Array<{ rotulo: string; valor: number; alerta: boolean }> = []
  if (n(p.a_vencer) > 0) {
    const prox = p.proximo_vencimento ? ` · próxima ${diaMes(p.proximo_vencimento)}` : ''
    out.push({ rotulo: `A vencer (${n(p.a_vencer_qtd)} parcelas${prox})`, valor: n(p.a_vencer), alerta: false })
  }
  if (n(p.aguardando_extrato) > 0) out.push({ rotulo: `Pago pelo cliente, aguardando extrato (${n(p.aguardando_extrato_qtd)})`, valor: n(p.aguardando_extrato), alerta: false })
  if (n(p.em_atraso) > 0) out.push({ rotulo: `Em atraso do cliente (${n(p.em_atraso_qtd)})`, valor: n(p.em_atraso), alerta: true })
  if (n(p.complementos) > 0) out.push({ rotulo: `Complementos pendentes (${n(p.complementos_qtd)})`, valor: n(p.complementos), alerta: false })
  return out
}

export function montarHtmlPosicao(nome: string, competenciaPagamento: unknown, p: Posicao, link: string, expira: string, ano = new Date().getFullYear()): string {
  const c = esc(compAnterior(competenciaPagamento))
  const TD = 'padding:8px 6px;border-bottom:1px solid #e5e0d6;font-size:13px'
  const linhas = linhasPosicao(p).map((l) => {
    const cor = l.alerta ? `;color:${VERMELHO}` : ''
    return `<tr><td style="${TD}${cor}">${esc(l.rotulo)}</td><td style="${TD};text-align:right;white-space:nowrap${cor}">${brl(l.valor)}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="pt-BR"><body style="background:#ffffff;font-family:${FONTE};color:#222;margin:0;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:${FONTE}">
<tr><td style="background:${VERDE};padding:24px 32px"><span style="color:#ffffff;font-size:22px;font-weight:bold">Fetély.</span></td></tr>
<tr><td style="padding:32px">
<p style="margin:0;font-size:20px;font-weight:bold;color:${VERDE}">Olá, ${esc(primeiroNome(nome))}.</p>
<p style="margin:4px 0 20px;font-size:13px;color:#666">Posição de comissões · competência ${c}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">Nesta competência não houve comissão liberada para pagamento — por isso você não recebe extrato nem precisa emitir nota fiscal. Abaixo, o que está a caminho.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};border-radius:8px"><tr><td style="padding:20px;text-align:center">
<p style="margin:0;font-size:13px;color:#666">Carteira a receber</p>
<p style="margin:6px 0 0;font-size:32px;font-weight:bold;color:${VERDE}">${brl(p.carteira_total)}</p>
</td></tr></table>
${linhas ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px"><tbody>${linhas}</tbody></table>` : ''}
<p style="margin:24px 0;text-align:center"><a href="${esc(link)}" style="background:${ROSA};color:${VERDE};text-decoration:none;padding:14px 28px;border-radius:6px;display:inline-block;font-weight:bold;font-size:14px">Ver no portal</a></p>
<p style="margin-top:24px;font-size:12px;color:#666;line-height:1.6">A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. Quando houver valor liberado, você recebe o extrato com o pedido da nota fiscal.</p>
<p style="font-size:12px;color:#666">O link é pessoal e vale até ${esc(expira)}. Não compartilhe.</p>
</td></tr>
<tr><td style="background:${CREME};padding:16px 32px;text-align:center;font-size:12px;color:${VERDE}">#celebreoqueimporta · Fetély · ${ano}</td></tr>
</table>
</td></tr></table></body></html>`
}
