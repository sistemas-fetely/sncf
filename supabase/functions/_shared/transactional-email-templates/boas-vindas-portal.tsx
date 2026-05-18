import * as React from 'npm:react@18.3.1'
/// <reference types="npm:@types/react@18.3.1" />
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Fetely People'
const COR_VERDE = '#1a3d2b'
const COR_ROSA = '#F4A7B9'
const COR_CREME = '#F5F0E8'

interface BoasVindasProps {
  nome?: string
  email_corporativo?: string
  email_pessoal?: string | null
  email?: string // legado
  link?: string
}

const BoasVindasPortalEmail = ({
  nome = 'colaborador(a)',
  email_corporativo,
  email,
  link = 'https://sncf.lovable.app',
}: BoasVindasProps) => {
  const emailMostrado = email_corporativo || email || ''
  const primeiroNome = (nome || '').split(' ')[0] || 'colaborador(a)'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Bem-vinda à Fetely — ative seu acesso ao {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandHeader}>
            <Text style={brandName}>Fetély.</Text>
          </Section>

          <Section style={bodySection}>
            <Heading style={h1}>Bem-vinda, {primeiroNome}.</Heading>

            <Text style={text}>
              <em>Os de dentro primeiro.</em> Este é um dos nossos DNAs aqui na Fetely — e é
              exatamente por isso que a gente construiu o {SITE_NAME}: um lugar onde
              você gerencia seus dados, acompanha sua jornada conosco e resolve o que
              precisar sem esperar resposta de ninguém.
            </Text>

            <Text style={text}>
              Seu primeiro acesso está esperando. Clique no botão abaixo para definir sua senha.
            </Text>

            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button style={button} href={link}>
                Ativar meu acesso
              </Button>
            </Section>

            {emailMostrado && (
              <Text style={emailLine}>
                Seu email de acesso: <strong>{emailMostrado}</strong>
              </Text>
            )}

            <Hr style={hr} />

            <Text style={textSmall}>
              Qualquer dúvida, a gente tá por aqui. Mas antes, tenta sozinha — o sistema foi
              feito pra isso. Se esquecer a senha no futuro, é só clicar em "Esqueci minha senha"
              na tela de login. Self-service é libertador.
            </Text>
            <Text style={textSmall}>
              Este link expira em 24 horas por segurança. Se já venceu, acesse {link} e
              clique em "Esqueci minha senha".
            </Text>
          </Section>

          <Section style={footerSection}>
            <Text style={footer}>
              #celebreoqueimporta · Fetely · {new Date().getFullYear()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BoasVindasPortalEmail,
  subject: `Bem-vinda à Fetely — ative seu acesso ao ${SITE_NAME}`,
  displayName: 'Boas-vindas ao portal',
  previewData: {
    nome: 'Maria Silva',
    email_corporativo: 'maria.silva@fetely.com.br',
    link: 'https://sncf.lovable.app',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto' }
const brandHeader = { backgroundColor: COR_VERDE, padding: '24px 30px', textAlign: 'center' as const }
const brandName = { color: '#ffffff', fontSize: '22px', fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: 0 }
const bodySection = { padding: '32px 30px', backgroundColor: '#ffffff' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: COR_VERDE, margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 12px' }
const emailLine = { fontSize: '14px', color: '#3a3a4a', textAlign: 'center' as const, margin: '0 0 8px', backgroundColor: COR_CREME, padding: '12px', borderRadius: '6px' }
const button = { backgroundColor: COR_ROSA, color: COR_VERDE, padding: '14px 32px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none', display: 'inline-block' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerSection = { padding: '20px 30px', backgroundColor: COR_CREME, textAlign: 'center' as const }
const footer = { fontSize: '11px', color: COR_VERDE, margin: 0, letterSpacing: '0.3px' }
