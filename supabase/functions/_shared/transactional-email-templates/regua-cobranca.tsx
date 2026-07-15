import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  corpo?: string
  assunto?: string
}

const ReguaCobrancaEmail = ({ corpo, assunto }: Props) => {
  const linhas = (corpo ?? '').split('\n')
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{assunto || 'Fetély · Comunicação de cobrança'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Text style={headerBrand}>Fetély.</Text>
          </Section>

          <Section style={bodySection}>
            {linhas.map((linha, i) => (
              <Text key={i} style={linha.trim() === '' ? spacer : paragraph}>
                {linha || '\u00A0'}
              </Text>
            ))}
          </Section>

          <Hr style={hr} />

          <Section style={footerSection}>
            <Text style={footerText}>
              Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: ReguaCobrancaEmail,
  subject: (data) => data.assunto || 'Fetély · Comunicação de cobrança',
  displayName: 'Régua de Cobrança',
  previewData: {
    assunto: 'Fetély · Lembrete de vencimento',
    corpo:
      'Olá, Loja das Festas Ltda.\n\nEste é um lembrete do título 000123, no valor de R$ 1.200,00, com vencimento em 15/06/2026.\n\nEm caso de dúvidas, responda este e-mail.\n\nEquipe Fetély',
  },
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '0', maxWidth: '560px', backgroundColor: '#ffffff' }
const headerSection = { backgroundColor: '#1a7a5e', padding: '24px', textAlign: 'center' as const }
const headerBrand = { color: '#ffffff', fontSize: '24px', fontWeight: 'bold' as const, margin: '0', letterSpacing: '1px' }
const bodySection = { padding: '24px' }
const paragraph = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 6px' }
const spacer = { fontSize: '8px', lineHeight: '1', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '0 24px' }
const footerSection = { padding: '18px 24px 24px', textAlign: 'center' as const }
const footerText = { fontSize: '12px', color: '#9ca3af', lineHeight: '1.5', margin: '0' }
