// Ponto ÚNICO do sistema que fala com a API do Resend.
export const RESEND_FROM_DOMAIN = 'notify.fetelycorp.com.br'
export const RESEND_FROM_ADDRESS = `Fetély <noreply@${RESEND_FROM_DOMAIN}>`

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface ResendSendInput {
  apiKey: string
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  idempotencyKey?: string
  cc?: string[]
  attachments?: Array<{ filename: string; content: string }>
  unsubscribeUrl?: string
}

export async function sendResendEmail(input: ResendSendInput): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  }
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey
  }

  const body: Record<string, unknown> = {
    from: input.from || RESEND_FROM_ADDRESS,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  }
  if (input.text) body.text = input.text
  if (input.unsubscribeUrl) {
    body.headers = {
      'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
  }
  if (input.cc && input.cc.length > 0) body.cc = input.cc
  if (input.attachments && input.attachments.length > 0) body.attachments = input.attachments

  const resp = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const json = await resp.json().catch(() => ({}))

  if (!resp.ok) {
    throw new Error(`Resend ${resp.status}: ${JSON.stringify(json)}`)
  }

  return json
}
