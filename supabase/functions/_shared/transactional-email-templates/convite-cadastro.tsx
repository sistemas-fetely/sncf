import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetely People"

interface ConviteCadastroProps {
  nome?: string
  tipo?: string
  cargo?: string
  departamento?: string
  link?: string
}

const ConviteCadastroEmail = ({ nome, tipo, cargo, departamento, link }: ConviteCadastroProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você recebeu um convite para pré-cadastro — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Olá{nome ? `, ${nome}` : ''}!</Heading>
        <Text style={text}>
          Você foi convidado(a) para preencher seu pré-cadastro como{' '}
          <strong>{tipo === 'pj' ? 'Prestador PJ' : 'Colaborador CLT'}</strong>
          {cargo ? ` para o cargo de ${cargo}` : ''}
          {departamento ? ` no departamento ${departamento}` : ''}.
        </Text>
        <Text style={text}>
          Clique no botão abaixo para acessar o formulário e preencher seus dados. O link é válido por 7 dias.
        </Text>
        {link && (
          <Button style={button} href={link}>
            Preencher Cadastro
          </Button>
        )}
        <Hr style={hr} />
        <Text style={footer}>
          Este é um e-mail automático enviado por {SITE_NAME}. Caso não reconheça este convite, ignore esta mensagem.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ConviteCadastroEmail,
  subject: (data: Record<string, any>) =>
    `Convite de Pré-Cadastro${data?.nome ? ` — ${data.nome}` : ''}`,
  displayName: 'Convite de Pré-Cadastro',
  previewData: {
    nome: 'Maria Silva',
    tipo: 'clt',
    cargo: 'Analista',
    departamento: 'Tecnologia',
    link: 'https://sncf.lovable.app/cadastro/abc123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#1a3a5c',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  textDecoration: 'none' as const,
  display: 'inline-block' as const,
  margin: '8px 0 24px',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
