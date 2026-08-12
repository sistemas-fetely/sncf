import * as React from 'npm:react@18.3.1'
/// <reference types="npm:@types/react@18.3.1" />
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Fetély'
const COR_VERDE = '#1a3d2b'
const COR_CREME = '#F5F0E8'

interface Props {
  nome?: string
  email_corporativo?: string
}

const AvisoEmailPessoalEmail = ({
  nome = 'colaborador(a)',
  email_corporativo = '',
}: Props) => {
  const primeiroNome = (nome || '').split(' ')[0] || 'colaborador(a)'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Sua conta Fetely foi criada — credenciais vão pro email corporativo</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandHeader}>
            <Text style={brandName}>Fetély.</Text>
          </Section>

          <Section style={bodySection}>
            <Heading style={h1}>Oi, {primeiroNome}!</Heading>

            <Text style={text}>
              Estamos te escrevendo neste email pessoal só pra te avisar: sua
              conta no <strong>{SITE_NAME}</strong> foi criada.
            </Text>

            <Text style={text}>
              As credenciais e o link de primeiro acesso foram enviados pro seu
              email corporativo: <strong>{email_corporativo}</strong>.
            </Text>

            <Hr style={hr} />

            <Text style={textSmall}>
              Se você ainda não tem acesso ao seu inbox corporativo, fale com o RH.
              Dali pra frente, toda comunicação oficial do sistema vai pro corporativo —
              é lá que tua vida Fetely acontece.
            </Text>

            <Text style={textSmall}>
              Este email é só informativo. Você não precisa fazer nada aqui.
            </Text>
          </Section>

          <Section style={footerSection}>
            <Text style={footer}>#celebreoqueimporta · Fetely</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AvisoEmailPessoalEmail,
  subject: 'Sua conta Fetely foi criada',
  displayName: 'Aviso ao email pessoal',
  previewData: {
    nome: 'Maria Silva',
    email_corporativo: 'maria.silva@fetely.com.br',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto' }
const brandHeader = { backgroundColor: COR_VERDE, padding: '24px 30px', textAlign: 'center' as const }
const brandName = { color: '#ffffff', fontSize: '22px', fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: 0 }
const bodySection = { padding: '32px 30px', backgroundColor: '#ffffff' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: COR_VERDE, margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 12px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerSection = { padding: '20px 30px', backgroundColor: COR_CREME, textAlign: 'center' as const }
const footer = { fontSize: '11px', color: COR_VERDE, margin: 0, letterSpacing: '0.3px' }
