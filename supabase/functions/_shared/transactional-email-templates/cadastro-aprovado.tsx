import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetely People"

interface CadastroAprovadoProps {
  nome?: string
}

const CadastroAprovadoEmail = ({ nome }: CadastroAprovadoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu cadastro foi aprovado — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cadastro Aprovado! 🎉</Heading>
        <Text style={text}>
          {nome ? `Olá, ${nome}!` : 'Olá!'} Temos o prazer de informar que seu cadastro foi
          analisado e <strong>aprovado com sucesso</strong> pela nossa equipe.
        </Text>
        <Text style={text}>
          Seu acesso ao sistema {SITE_NAME} já está liberado. Utilize o botão abaixo para acessar a plataforma.
        </Text>
        <Button style={button} href="https://sncf.lovable.app/login">
          Acessar o Sistema
        </Button>
        <Text style={text}>
          Caso tenha alguma dúvida, entre em contato com o departamento de RH.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          Este é um e-mail automático enviado por {SITE_NAME}. Caso não reconheça esta mensagem, ignore-a.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CadastroAprovadoEmail,
  subject: 'Seu cadastro foi aprovado!',
  displayName: 'Cadastro Aprovado',
  previewData: {
    nome: 'Maria Silva',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#1a3a5c',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  margin: '24px 0',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
