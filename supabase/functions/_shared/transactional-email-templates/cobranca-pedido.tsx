import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Html, Preview, Text, Hr, Section, Row, Column, Link, Img,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

type TipoPagamento = 'pix' | 'cartao' | 'cartao_credito' | 'cartao_debito' | 'boleto' | string

interface CobrancaPedidoProps {
  parceiro_nome?:    string
  pedido_id_externo?: string
  data_pedido?:      string
  forma_pagamento?:  string
  condicao_pagamento?: string
  valor_bruto?:      string
  desconto?:         string
  valor_frete?:      string
  valor_liquido?:    string
  link_pagamento?:   string
  tipo_pagamento?:   TipoPagamento
  qr_code_pix?:      string
}

const Verde      = '#2d5a27'
const VerdeEscuro = '#234820'
const Creme      = '#f0ecd8'
const TextoVerde = '#2d4a24'

// ── Textos por tipo de pagamento ─────────────────────────────
function getConteudo(tipo?: TipoPagamento) {
  const t = (tipo ?? '').toLowerCase()
  if (t === 'pix') return {
    headline:   'Pagamento à vista.\nRápido, simples e garantido.',
    subline:    'Seu pedido está confirmado. Escaneie o QR Code ou copie o código PIX abaixo para concluir o pagamento.',
    ctaLabel:   '',
    ctaColor:   '#1a73e8',
  }
  if (t.includes('cartao') || t.includes('cartão')) return {
    headline:   'Tudo no cartão.\nNada esquecido.',
    subline:    'Segue o link para concluir o pagamento. Rápido, seguro e simples — como deve ser.',
    ctaLabel:   'Pagar com Cartão',
    ctaColor:   Verde,
  }
  if (t === 'boleto') return {
    headline:   'Quase lá.\nSó falta confirmar o pagamento.',
    subline:    'Seu boleto está em anexo a este email. Pague até o vencimento para garantir a sua entrega.',
    ctaLabel:   '',
    ctaColor:   Verde,
  }
  // fallback genérico
  return {
    headline:   'Toda grande celebração\ncomeça com uma escolha...\nA sua já foi feita!',
    subline:    'Siga as instruções abaixo para concluir o seu pedido.',
    ctaLabel:   'Realizar Pagamento',
    ctaColor:   Verde,
  }
}

const CobrancaPedidoEmail = ({
  parceiro_nome,
  pedido_id_externo,
  data_pedido,
  forma_pagamento,
  condicao_pagamento,
  valor_bruto,
  desconto,
  valor_frete,
  valor_liquido,
  link_pagamento,
  tipo_pagamento,
  qr_code_pix,
}: CobrancaPedidoProps) => {
  const { headline, subline, ctaLabel, ctaColor } = getConteudo(tipo_pagamento)
  const tipoPag = (tipo_pagamento ?? '').toLowerCase()
  const isPix     = tipoPag === 'pix'
  const isCartao  = tipoPag.includes('cart')

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Fetély · {headline.split('\n')[0]}</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* ── Header: faixa verde larga com badge interno ── */}
          <Section style={headerSection}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
              <tr>
                <td align="center" style={{ padding: '32px 0 24px' }}>
                  <div style={badgeStyle}>
                    <Text style={badgeText}>
                      Fetély.
                    </Text>
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* ── Corpo ── */}
          <Section style={body}>

            {/* Headline dinâmica */}
            <Text style={headlineNormal}>
                {headline.split('\n').map((linha, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {i === headline.split('\n').length - 1 ? (
                      <span style={headlineBold}>
                        {linha}
                      </span>
                    ) : (
                      linha
                    )}
                  </React.Fragment>
                ))}
              </Text>

            <Text style={sublineStyle}>
              {subline}
            </Text>

            <Hr style={divider} />

            {/* Card dados do pedido */}
            <Section style={cardSection}>
              {parceiro_nome && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Cliente</Column>
                  <Column style={infoValue}>{parceiro_nome}</Column>
                </Row>
              )}
              {pedido_id_externo && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Pedido</Column>
                  <Column style={infoValue}>{pedido_id_externo}</Column>
                </Row>
              )}
              {data_pedido && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Data</Column>
                  <Column style={infoValue}>{data_pedido}</Column>
                </Row>
              )}
              {(forma_pagamento || condicao_pagamento) && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Pagamento</Column>
                  <Column style={infoValue}>
                    {forma_pagamento}{condicao_pagamento ? ` · ${condicao_pagamento}` : ''}
                  </Column>
                </Row>
              )}
            </Section>

            {/* Resumo financeiro */}
            {valor_liquido && (
              <Section style={resumoSection}>
                {valor_bruto && (
                  <Row>
                    <Column style={resumoLabel}>Valor bruto</Column>
                    <Column style={resumoValor}>{valor_bruto}</Column>
                  </Row>
                )}
                {desconto && (
                  <Row>
                    <Column style={resumoLabel}>Desconto</Column>
                    <Column style={resumoValor}>{desconto}</Column>
                  </Row>
                )}
                {valor_frete && (
                  <Row>
                    <Column style={resumoLabel}>Frete</Column>
                    <Column style={resumoValor}>{valor_frete}</Column>
                  </Row>
                )}
                <Row>
                  <Column style={{ ...resumoLabel, color: TextoVerde, fontWeight: 700 }}>Total</Column>
                  <Column style={{ ...resumoValor, color: TextoVerde, fontWeight: 700 }}>{valor_liquido}</Column>
                </Row>
              </Section>
            )}

            {/* PIX: QR Code + link como texto */}
            {isPix && (
              <Section style={{ textAlign: 'center', marginTop: '24px' }}>
                {qr_code_pix && (
                  <Img src={qr_code_pix} alt="QR Code PIX" style={{ margin: '0 auto 16px', display: 'block' }} />
                )}
                {link_pagamento && (
                  <Section style={pixLinkBox}>
                    <Text style={pixLabelStyle}>Código PIX — copie e cole no seu banco:</Text>
                    <Text style={pixCopiavel}>{link_pagamento}</Text>
                  </Section>
                )}
                <Text style={ctaNote}>
                  O PDF completo do pedido está em anexo neste email.
                </Text>
              </Section>
            )}

            {/* Cartão: botão com link */}
            {isCartao && link_pagamento && (
              <Section style={{ textAlign: 'center', marginTop: '24px' }}>
                <Button href={link_pagamento} style={{ ...ctaButton, backgroundColor: ctaColor }}>
                  {ctaLabel}
                </Button>
                <Text style={ctaNote}>
                  O PDF completo do pedido está em anexo neste email.
                </Text>
              </Section>
            )}

            {/* Boleto / fallback sem link */}
            {!isPix && !isCartao && (
              <Section style={{ textAlign: 'center', marginTop: '24px' }}>
                <Text style={ctaNote}>
                  O PDF completo do pedido está em anexo neste email.
                </Text>
              </Section>
            )}

          </Section>

          {/* ── Footer ── */}
          <Section style={footer}>
            <Text style={footerText}>
              Fetely Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
            </Text>
            <Text style={footerText}>
              #celebreoqueimporta
            </Text>
            <Text style={footerText}>
              Dúvidas? Fale conosco:{' '}
              <Link href="mailto:sac@fetely.com.br" style={{ color: 'rgba(255,255,255,0.9)' }}>sac@fetely.com.br</Link>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

// ── Estilos ──────────────────────────────────────────────────
const main          = { backgroundColor: '#f4f4f0', fontFamily: 'Georgia, "Times New Roman", serif' }
const container     = { maxWidth: '580px', margin: '0 auto', backgroundColor: '#ffffff' }
const headerSection = { backgroundColor: Verde, display: 'block' as const }
const badgeStyle    = {
  display:         'inline-block',
  backgroundColor: Creme,
  borderRadius:    '60px',
  padding:         '14px 40px',
  border:          `2.5px solid ${Creme}`,
  boxShadow:       '0 2px 12px rgba(0,0,0,0.18)',
}
const badgeText     = {
  fontSize:   '26px',
  color:      TextoVerde,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontStyle:  'italic',
  fontWeight: '700',
  lineHeight: '1',
}
const body          = { padding: '36px 40px 24px' }
const headlineNormal = { fontSize: '21px', color: TextoVerde, lineHeight: '1.45', textAlign: 'center' as const, fontWeight: '400', margin: '0 0 4px' }
const headlineBold   = { fontSize: '21px', color: TextoVerde, lineHeight: '1.45', textAlign: 'center' as const, fontWeight: '700', margin: '0 0 16px' }
const sublineStyle  = { fontSize: '14px', color: '#555', textAlign: 'center' as const, lineHeight: '1.65', margin: '0 0 24px' }
const divider       = { borderColor: '#e5e0d0', margin: '0 0 20px' }
const cardSection   = { backgroundColor: '#faf8f3', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' }
const infoRow       = { marginBottom: '7px' }
const infoLabel     = { fontSize: '11px', color: '#888', width: '38%', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const infoValue     = { fontSize: '13px', color: '#222', fontWeight: '600' }
const resumoSection = { backgroundColor: '#faf8f3', borderRadius: '8px', padding: '14px 20px', marginTop: '4px' }
const resumoLabel   = { fontSize: '13px', color: '#666', paddingBottom: '5px' }
const resumoValor   = { fontSize: '13px', color: '#222', textAlign: 'right' as const, paddingBottom: '5px' }
const ctaButton     = { color: '#ffffff', fontSize: '15px', fontWeight: '700', padding: '14px 36px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block' }
const ctaNote       = { fontSize: '12px', color: '#999', textAlign: 'center' as const, marginTop: '10px' }
const pixLinkBox    = { backgroundColor: '#f0f7ee', borderRadius: '8px', padding: '12px 20px', marginBottom: '12px', border: '1px solid #c8e0c4' }
const pixLabelStyle = { fontSize: '11px', color: '#5a7a54', textAlign: 'center' as const, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const pixCopiavel   = { fontSize: '11px', color: '#2d5a27', fontFamily: 'monospace, Courier, "Courier New"', wordBreak: 'break-all' as const, textAlign: 'center' as const, margin: '0', fontWeight: '600' as const }
const footer        = { backgroundColor: VerdeEscuro, padding: '20px 32px' }
const footerText    = { fontSize: '11px', color: 'rgba(255,255,255,0.65)', margin: '0 0 5px', textAlign: 'center' as const }

export const template: TemplateEntry = {
  component: CobrancaPedidoEmail,
  subject: (data) =>
    `Fetély · Seu pedido está pronto para pagamento${data.pedido_id_externo ? ` · ${data.pedido_id_externo}` : ''}`,
  displayName: 'Cobrança ao Cliente (Pedido)',
  previewData: {
    parceiro_nome:    'Bella Decorações',
    pedido_id_externo: 'PED-1780249308300',
    data_pedido:      '06/06/2026',
    forma_pagamento:  'PIX',
    condicao_pagamento: 'À vista',
    valor_bruto:      'R$ 4.807,65',
    desconto:         '-R$ 144,23',
    valor_frete:      '+R$ 96,00',
    valor_liquido:    'R$ 4.759,42',
    link_pagamento:   'https://pag.ae/exemplo',
    tipo_pagamento:   'pix',
  },
}