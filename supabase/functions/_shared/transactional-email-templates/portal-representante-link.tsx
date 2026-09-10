import * as React from 'npm:react@18.3.1'
/// <reference types="npm:@types/react@18.3.1" />
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const COR_VERDE = '#1a3d2b'
const COR_ROSA = '#F4A7B9'
const COR_CREME = '#F5F0E8'

interface PortalLinkProps {
  nome?: string
  link?: string
}

const PortalRepresentanteLinkEmail = ({ nome, link = '' }: PortalLinkProps) => {
  const primeiroNome = (nome || '').split(' ')[0] || 'representante'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Seu link de acesso ao Portal do Representante Fetély</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandHeader}>
            <Text style={brandName}>Fetély.</Text>
          </Section>

          <Section style={bodySection}>
            <Heading style={h1}>Olá, {primeiroNome}.</Heading>

            <Text style={text}>
              Recebemos um pedido de acesso ao <strong>Portal do Representante Fetély</strong>.
              Use o botão abaixo para entrar.
            </Text>

            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button style={button} href={link}>
                Entrar no portal
              </Button>
            </Section>

            <Text style={aviso}>
              Este link vale por <strong>15 minutos</strong> e é de <strong>uso único</strong>.
              Depois disso, basta solicitar um novo acesso na página do portal.
            </Text>

            <Hr style={hr} />

            <Text style={textSmall}>
              Se não foi você que pediu este acesso, ignore este e-mail — nada acontece
              sem que o link seja aberto.
            </Text>
          </Section>

          <Section style={footerSection}>
            <Text style={footer}>
              #celebreoqueimporta · Fetély · {new Date().getFullYear()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PortalRepresentanteLinkEmail,
  subject: 'Seu acesso ao Portal do Representante Fetély',
  displayName: 'Portal do Representante — link de acesso',
  previewData: {
    nome: 'Ana Souza',
    link: 'https://sncf.lovable.app/portal?t=exemplo',
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
const aviso = { fontSize: '14px', color: '#3a3a4a', textAlign: 'center' as const, margin: '0 0 8px', backgroundColor: COR_CREME, padding: '12px', borderRadius: '6px' }
const button = { backgroundColor: COR_ROSA, color: COR_VERDE, padding: '14px 32px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none', display: 'inline-block' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerSection = { padding: '20px 30px', backgroundColor: COR_CREME, textAlign: 'center' as const }
const footer = { fontSize: '11px', color: COR_VERDE, margin: 0, letterSpacing: '0.3px' }
