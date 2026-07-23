import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Fetély'

interface SolicitacaoDocumentoProps {
  nome?: string
  valor_fmt?: string
  data_fmt?: string
  favorecido?: string
  nota?: string
}

const SolicitacaoDocumentoEmail = ({
  nome,
  valor_fmt,
  data_fmt,
  favorecido,
  nota,
}: SolicitacaoDocumentoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Documento fiscal pendente — {valor_fmt || ''} de {data_fmt || ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Documento fiscal pendente</Heading>

        <Text style={text}>{nome ? `Olá, ${nome}!` : 'Olá!'}</Text>
        <Text style={text}>
          O pagamento abaixo está sem documento fiscal no sistema Fetely (SNCF):
        </Text>

        <Section style={card}>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Valor</Text></Column>
            <Column><Text style={valueStrong}>{valor_fmt || '—'}</Text></Column>
          </Row>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Data</Text></Column>
            <Column><Text style={valueText}>{data_fmt || '—'}</Text></Column>
          </Row>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Favorecido</Text></Column>
            <Column><Text style={valueText}>{favorecido || '—'}</Text></Column>
          </Row>
        </Section>

        {nota && (
          <Section style={obsBox}>
            <Text style={text}><strong>Observação:</strong> {nota}</Text>
          </Section>
        )}

        <Text style={text}>
          Por favor, envie a nota fiscal, fatura, invoice ou recibo correspondente para regularizarmos o registro.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          — Equipe Financeiro {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SolicitacaoDocumentoEmail,
  subject: (d: Record<string, any>) =>
    `Documento fiscal pendente — pagamento ${d.valor_fmt} de ${d.data_fmt}`,
  displayName: 'Solicitação de Documento Fiscal',
  previewData: {
    nome: 'Maria',
    valor_fmt: 'R$ 1.000,00',
    data_fmt: '07/07/2026',
    favorecido: 'Fornecedor XPTO Ltda',
    nota: 'Enviar até sexta-feira, por favor.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 12px' }
const card = { padding: '14px 16px', backgroundColor: '#f7f9fc', borderRadius: '8px', margin: '0 0 14px', border: '1px solid #e5e7eb' }
const obsBox = { padding: '12px 16px', backgroundColor: '#fffaf0', borderRadius: '8px', margin: '0 0 14px', border: '1px solid #fde9c4' }
const labelCol = { width: '120px', verticalAlign: 'top' as const }
const labelText = { fontSize: '12px', color: '#6b7280', margin: '4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const valueText = { fontSize: '14px', color: '#1a3a5c', margin: '4px 0' }
const valueStrong = { fontSize: '16px', color: '#1a3a5c', margin: '4px 0', fontWeight: 'bold' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#999999', margin: '0', lineHeight: '1.5' }
