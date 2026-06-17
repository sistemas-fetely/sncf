import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Preview, Text, Hr, Section, Row, Column, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface NfEntregaProps {
  parceiro_nome?:     string
  pedido_id_externo?: string
  nf_numero?:         string
  valor_liquido?:     string
}

const Verde       = '#2d5a27'
const VerdeEscuro = '#234820'
const Creme       = '#f0ecd8'
const TextoVerde  = '#2d4a24'

const NfEntregaEmail = ({
  parceiro_nome,
  pedido_id_externo,
  nf_numero,
  valor_liquido,
}: NfEntregaProps) => {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Fetély · Sua nota fiscal chegou.</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={headerSection}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
              <tr>
                <td align="center" style={{ padding: '32px 0 24px' }}>
                  <div style={badgeStyle}>
                    <Text style={badgeText}>Fetély.</Text>
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* Corpo */}
          <Section style={body}>
            <Text style={headlineNormal}>
              <span style={headlineBold}>Sua nota fiscal chegou.</span>
            </Text>

            <Text style={sublineStyle}>
              {pedido_id_externo
                ? `O pedido ${pedido_id_externo} foi faturado. A nota fiscal e o XML estão anexados a este e-mail.`
                : 'Seu pedido foi faturado. A nota fiscal e o XML estão anexados a este e-mail.'}
              {' '}Qualquer dúvida, é só responder por aqui.
            </Text>

            <Hr style={divider} />

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
              {nf_numero && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Nota Fiscal</Column>
                  <Column style={infoValue}>{nf_numero}</Column>
                </Row>
              )}
              {valor_liquido && (
                <Row style={infoRow}>
                  <Column style={infoLabel}>Total</Column>
                  <Column style={infoValue}>{valor_liquido}</Column>
                </Row>
              )}
            </Section>

            <Text style={ctaNote}>
              A NF (PDF) e o XML estão em anexo neste e-mail.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Fetely Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
            </Text>
            <Text style={footerText}>#celebreoqueimporta</Text>
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
const body            = { padding: '36px 40px 24px' }
const headlineNormal  = { fontSize: '21px', color: TextoVerde, lineHeight: '1.45', textAlign: 'center' as const, fontWeight: '400', margin: '0 0 16px' }
const headlineBold    = { fontSize: '21px', color: TextoVerde, lineHeight: '1.45', textAlign: 'center' as const, fontWeight: '700' }
const sublineStyle    = { fontSize: '14px', color: '#555', textAlign: 'center' as const, lineHeight: '1.65', margin: '0 0 24px' }
const divider         = { borderColor: '#e5e0d0', margin: '0 0 20px' }
const cardSection     = { backgroundColor: '#faf8f3', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' }
const infoRow         = { marginBottom: '7px' }
const infoLabel       = { fontSize: '11px', color: '#888', width: '38%', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const infoValue       = { fontSize: '13px', color: '#222', fontWeight: '600' }
const ctaNote         = { fontSize: '12px', color: '#999', textAlign: 'center' as const, marginTop: '10px' }
const footer          = { backgroundColor: VerdeEscuro, padding: '20px 32px' }
const footerText      = { fontSize: '11px', color: 'rgba(255,255,255,0.65)', margin: '0 0 5px', textAlign: 'center' as const }

export const template: TemplateEntry = {
  component: NfEntregaEmail,
  subject: (data) =>
    `[Fetely] Sua nota fiscal — Pedido ${data.pedido_id_externo ?? ''}`.trim(),
  displayName: 'Entrega de NF (Pedido Faturado)',
  previewData: {
    parceiro_nome:     'Bella Decorações',
    pedido_id_externo: 'PED-1780249308300',
    nf_numero:         '12345',
    valor_liquido:     'R$ 4.759,42',
  },
}
