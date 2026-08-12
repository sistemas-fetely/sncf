import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetély"

interface CadastroRecebidoProps {
  nome?: string
  tipo?: string
  cargo?: string
  departamento?: string
}

const CadastroRecebidoEmail = ({ nome, tipo, cargo, departamento }: CadastroRecebidoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Cadastro recebido com sucesso — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cadastro Recebido!</Heading>
        <Text style={text}>
          Olá{nome ? `, ${nome}` : ''}! Confirmamos o recebimento dos seus dados de pré-cadastro
          como <strong>{tipo === 'pj' ? 'Prestador PJ' : 'Colaborador CLT'}</strong>
          {cargo ? ` para o cargo de ${cargo}` : ''}
          {departamento ? ` no departamento ${departamento}` : ''}.
        </Text>
        <Text style={text}>
          Nossa equipe de RH irá analisar suas informações e entrará em contato em breve com os próximos passos.
        </Text>
        <Text style={text}>
          Caso precise atualizar alguma informação, utilize o mesmo link recebido anteriormente.
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
  component: CadastroRecebidoEmail,
  subject: 'Seu cadastro foi recebido com sucesso',
  displayName: 'Cadastro Recebido',
  previewData: {
    nome: 'Maria Silva',
    tipo: 'clt',
    cargo: 'Analista',
    departamento: 'Tecnologia',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
