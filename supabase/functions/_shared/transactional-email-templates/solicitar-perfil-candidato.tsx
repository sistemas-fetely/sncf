import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview,
  Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  nome?: string
  cargo?: string
  link_vaga?: string
}

const SolicitarPerfilCandidatoEmail = ({
  nome = 'Candidato',
  cargo = 'a vaga',
  link_vaga = '',
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Complete seu perfil — {cargo} na Fetely</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={logo}>Fetély.</Heading>
          <Text style={tagline}>Vamos celebrar!! Venha criar algo novo...</Text>
        </Section>

        <Section style={content}>
          <Heading style={h1}>Precisamos de mais informações 👋</Heading>
          <Text style={text}>Olá, <strong>{nome.split(' ')[0]}</strong>!</Text>
          <Text style={text}>
            Seu interesse na vaga de{' '}
            <strong>{cargo}</strong>{' '}
            foi registrado. Para avançarmos no processo, precisamos
            que você complete seu perfil com suas experiências,
            formação e skills.
          </Text>
          <Text style={text}>
            Leva menos de 5 minutos e você pode importar seu currículo em PDF
            para preencher automaticamente. 🚀
          </Text>

          <Button style={btn} href={link_vaga}>
            Completar meu perfil →
          </Button>

          <Text style={linkText}>
            Ou acesse: {link_vaga}
          </Text>
        </Section>

        <Hr style={hr} />

        <Section style={footer}>
          <Text style={footerText}>
            Seus dados serão tratados conforme nossa política LGPD e retidos
            por até 180 dias após o encerramento da vaga.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SolicitarPerfilCandidatoEmail,
  subject: (data: Record<string, any>) =>
    `Complete seu perfil — ${data.cargo ?? 'a vaga'} na Fetely`,
  displayName: 'Solicitar perfil do candidato',
  previewData: {
    nome: 'João Felix',
    cargo: 'Analista RH Jr',
    link_vaga: 'https://sncf.lovable.app/vagas/exemplo',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const header = { backgroundColor: '#1A4A3A', padding: '32px 40px', textAlign: 'center' as const }
const logo = { color: '#ffffff', fontSize: '28px', fontWeight: '700' as const, margin: '0', letterSpacing: '-0.5px' }
const tagline = { color: '#D8F3DC', fontSize: '13px', margin: '8px 0 0', fontStyle: 'italic' }
const content = { padding: '40px' }
const h1 = { color: '#1A4A3A', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 16px' }
const text = { color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 20px' }
const btn = { display: 'inline-block', backgroundColor: '#1A4A3A', color: '#ffffff', padding: '14px 28px', borderRadius: '10px', textDecoration: 'none', fontWeight: '600' as const, fontSize: '14px' }
const linkText = { color: '#9CA3AF', fontSize: '12px', margin: '16px 0 0', wordBreak: 'break-all' as const }
const hr = { borderColor: '#E5E7EB', margin: '0' }
const footer = { backgroundColor: '#F9FAFB', padding: '24px 40px' }
const footerText = { color: '#9CA3AF', fontSize: '11px', lineHeight: '1.6', margin: '0', textAlign: 'center' as const }
