/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetely People"

interface Props {
  nome?: string
  comentario?: string
  link?: string
}

const CadastroDevolvido = ({ nome = "Colaborador", comentario = "", link = "" }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu cadastro precisa de ajustes — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Text style={logoText}>Fetély.</Text>
          <Text style={logoSubtext}>Gestão de Pessoas</Text>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>Cadastro devolvido para ajustes</Heading>
          <Text style={text}>
            Olá, {nome.split(" ")[0]}! O RH revisou seu pré-cadastro e identificou alguns pontos que precisam de ajuste.
          </Text>
          {comentario && (
            <Section style={commentBox}>
              <Text style={commentLabel}>Observação do RH</Text>
              <Text style={commentText}>{comentario}</Text>
            </Section>
          )}
          <Text style={text}>
            Acesse o link abaixo para corrigir as informações e reenviar:
          </Text>
          {link && (
            <Button href={link} style={button}>
              Corrigir meu cadastro
            </Button>
          )}
          <Hr style={hr} />
          <Text style={footer}>
            {SITE_NAME} · Gestão de Pessoas
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CadastroDevolvido,
  subject: "Seu cadastro precisa de ajustes — Fetely",
  displayName: "Cadastro Devolvido",
  previewData: {
    nome: "Maria Silva",
    comentario: "Por favor, corrija o número do CPF e envie novamente a foto do RG (ficou ilegível).",
    link: "https://sncf.lovable.app/cadastro/abc123",
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif", margin: '0', padding: '0' }
const container = { maxWidth: '560px', margin: '0 auto' }
const logoSection = { padding: '30px 25px 0', textAlign: 'center' as const }
const logoText = { fontSize: '24px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0' }
const logoSubtext = { fontSize: '12px', color: '#6b7280', margin: '0' }
const contentSection = { padding: '20px 25px 30px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const commentBox = { backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const commentLabel = { fontSize: '13px', fontWeight: 'bold' as const, color: '#92400e', margin: '0 0 6px' }
const commentText = { fontSize: '14px', color: '#78350f', lineHeight: '1.5', margin: '0' }
const button = { backgroundColor: '#1a3a5c', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none', display: 'inline-block', margin: '0 0 16px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', textAlign: 'center' as const }
