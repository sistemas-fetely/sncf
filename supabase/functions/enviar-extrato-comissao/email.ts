// Montagem pura do e-mail do extrato de comissão (sem I/O) — testada em src/.
// Identidade visual igual a _shared/transactional-email-templates/portal-representante-link.tsx.

export const TOMADOR = 'FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA'
export const TOMADOR_CNPJ = '63.591.078/0001-48'

const VERDE = '#1a3d2b'
const ROSA = '#F4A7B9'
const CREME = '#F5F0E8'
const FONTE = "'Segoe UI', Arial, sans-serif"

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const brl = (v: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0) || 0)
const ymd = (v: unknown) => String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
export const data = (v: unknown) => { const m = ymd(v); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
export const diaMes = (v: unknown) => { const m = ymd(v); return m ? `${m[3]}/${m[2]}` : '—' }
/** "2026-10-01" → "10/2026". */
export const comp = (v: unknown) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : '—' }

/** Mês anterior de uma competência AAAA-MM(-DD) → "MM/AAAA". */
export function compAnterior(v: unknown): string {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return '—'
  const t = Number(m[1]) * 12 + (Number(m[2]) - 1) - 1
  return `${String((t % 12) + 1).padStart(2, '0')}/${Math.floor(t / 12)}`
}

/** Prazo da NF: dia 10 do mês de PAGAMENTO (`comissao_extrato.competencia`). */
export function prazoNf(competenciaPagamento: unknown): string {
  const m = String(competenciaPagamento ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `10/${m[2]}` : '—'
}

export const primeiroNome = (n: string) => {
  const p = (n ?? '').trim().split(/\s+/)[0] || 'representante'
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')
}

export const ROTULO_ESTORNO: Record<string, string> = {
  nf_cancelada: 'NF cancelada',
  nf_substituida: 'NF substituída',
  devolucao: 'Devolução',
  titulo_revertido: 'Título revertido',
  correcao_manual: 'Correção manual',
}

const TD = 'padding:8px 6px;border-bottom:1px solid #e5e0d6;font-size:13px'
const VALOR = `${TD};text-align:right;white-space:nowrap`

/** Uma <tr> por item do detalhe congelado do extrato. */
export function linhaDoItem(i: any): string {
  if (i?.tipo === 'saldo_anterior') {
    const seq = Number(i.sequencia_origem ?? 0) > 1 ? ` (nº ${esc(i.sequencia_origem)})` : ''
    const motivo = i.motivo ? String(i.motivo) : 'Valor fechado no mês anterior e ainda não pago — entra neste extrato.'
    return `<tr style="background:${CREME}"><td style="${TD}" colspan="4"><strong>Saldo em aberto de ${esc(compAnterior(i.competencia_origem))}</strong>${seq}<br><span style="color:#666;font-size:12px">${esc(motivo)}</span></td><td style="${VALOR}">${brl(i.valor)}</td></tr>`
  }
  if (i?.tipo === 'estorno') {
    const rotulo = ROTULO_ESTORNO[String(i.estorno_tipo ?? '')] ?? String(i.estorno_tipo ?? 'Estorno')
    const parcial = i.parcial ? ' (parcial)' : ''
    return `<tr style="color:#b91c1c"><td style="${TD}" colspan="4"><strong>${esc(rotulo + parcial)}</strong> — ${esc(i.motivo ?? '')}</td><td style="${VALOR}">${brl(i.valor)}</td></tr>`
  }
  if (i?.tipo === 'liberacao' && i?.subtipo === 'complemento') {
    return `<tr><td style="${TD}" colspan="4"><strong>Complemento</strong> — NF ${esc(i.nf ?? '—')} · ${esc(i.pedido ?? '—')}</td><td style="${VALOR}">${brl(i.valor)}</td></tr>`
  }
  return `<tr><td style="${TD}">${esc(i?.nf ?? '—')}</td><td style="${TD}">${esc(i?.pedido ?? '—')}</td><td style="${TD}">${esc(i?.parcela ?? '—')}</td><td style="${TD}">${data(i?.data_liquidacao)}</td><td style="${VALOR}">${brl(i?.valor)}</td></tr>`
}

export function assunto(e: any): string {
  return `Fetély · Extrato de comissão ${comp(e.competencia_apuracao)} — emitir NF até ${prazoNf(e.competencia)}`
}

export function montarHtml(nome: string, e: any, link: string, expira: string, ano = new Date().getFullYear()): string {
  const c = esc(comp(e.competencia_apuracao))
  const prazo = esc(prazoNf(e.competencia))
  const itens = Array.isArray(e.detalhe) ? e.detalhe : []
  const linhas = itens.map(linhaDoItem).join('')
  const th = `padding:8px 6px;font-size:12px;color:${VERDE};text-align:left;border-bottom:2px solid ${VERDE}`
  const rot = 'padding:4px 12px 4px 0;color:#666;font-size:13px;vertical-align:top'
  const val = `padding:4px 0;font-size:13px;color:${VERDE}`
  return `<!doctype html><html lang="pt-BR"><body style="background:#ffffff;font-family:${FONTE};color:#222;margin:0;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:${FONTE}">
<tr><td style="background:${VERDE};padding:24px 32px"><span style="color:#ffffff;font-size:22px;font-weight:bold">Fetély.</span></td></tr>
<tr><td style="padding:32px">
<p style="margin:0;font-size:20px;font-weight:bold;color:${VERDE}">Olá, ${esc(primeiroNome(nome))}.</p>
<p style="margin:4px 0 20px;font-size:13px;color:#666">Extrato de comissão · competência ${c}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">Seu extrato de ${c} está fechado. Para receber até <strong>${esc(diaMes(e.pagar_ate))}</strong>, emita a nota fiscal de serviço (ou RPA) e envie pelo portal até <strong>${prazo}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};border-radius:8px"><tr><td style="padding:20px;text-align:center">
<p style="margin:0;font-size:13px;color:#666">Valor exato a faturar</p>
<p style="margin:6px 0 0;font-size:32px;font-weight:bold;color:${VERDE}">${brl(e.valor_total)}</p>
</td></tr></table>
<p style="margin:24px 0;text-align:center"><a href="${esc(link)}" style="background:${ROSA};color:${VERDE};text-decoration:none;padding:14px 28px;border-radius:6px;display:inline-block;font-weight:bold;font-size:14px">Enviar minha nota fiscal</a></p>
<p style="margin:24px 0 8px;font-size:15px;font-weight:bold;color:${VERDE}">Dados para emissão</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="background:${CREME};border-radius:8px;width:100%"><tr><td style="padding:12px 16px"><table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="${rot}">Tomador</td><td style="${val}">${esc(TOMADOR)}</td></tr>
<tr><td style="${rot}">CNPJ</td><td style="${val}">${esc(TOMADOR_CNPJ)}</td></tr>
<tr><td style="${rot}">Descrição sugerida</td><td style="${val}">Serviços de representação comercial — comissão da competência ${c}</td></tr>
<tr><td style="${rot}">Valor</td><td style="${val};font-weight:bold">${brl(e.valor_total)}</td></tr>
</table></td></tr></table>
<p style="margin:28px 0 8px;font-size:15px;font-weight:bold;color:${VERDE}">De onde vem este valor</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<thead><tr><th style="${th}">NF</th><th style="${th}">Pedido</th><th style="${th}">Parcela</th><th style="${th}">Pago em</th><th style="${th};text-align:right">Comissão</th></tr></thead>
<tbody>${linhas || `<tr><td colspan="5" style="${TD}">Sem itens.</td></tr>`}</tbody>
<tfoot><tr><td colspan="4" style="padding:10px 6px;font-weight:bold;color:${VERDE}">Total</td><td style="padding:10px 6px;text-align:right;font-weight:bold;color:${VERDE};white-space:nowrap">${brl(e.valor_total)}</td></tr></tfoot>
</table>
<p style="margin-top:24px;font-size:12px;color:#666;line-height:1.6">A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. O pagamento ocorre até o dia 15 do mês subsequente, mediante nota fiscal de serviço (Lei 4.886/1965, art. 32). Divergências podem ser contestadas pelo portal.</p>
<p style="font-size:12px;color:#666">O link é pessoal e vale até ${esc(expira)}. Não compartilhe.</p>
</td></tr>
<tr><td style="background:${CREME};padding:16px 32px;text-align:center;font-size:12px;color:${VERDE}">#celebreoqueimporta · Fetély · ${ano}</td></tr>
</table>
</td></tr></table></body></html>`
}
