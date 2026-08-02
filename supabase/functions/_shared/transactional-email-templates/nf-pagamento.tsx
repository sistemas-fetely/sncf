import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Button, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetely People"
const APP_URL = "https://sncf.lovable.app"

interface NFPagamentoProps {
  nomeColaborador?: string
  nomeFantasia?: string
  numeroNF?: string
  valor?: string
  dataVencimento?: string
  notaFiscalId?: string
}

const NFPagamentoEmail = ({ nomeColaborador, nomeFantasia, numeroNF, valor, dataVencimento, notaFiscalId }: NFPagamentoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Nota Fiscal para pagamento - NF {numeroNF || ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nota Fiscal para Pagamento</Heading>
        <Text style={text}>
          Prezado(a),
        </Text>
        <Text style={text}>
          Segue abaixo a nota fiscal referente aos serviços prestados{nomeColaborador ? ` por ${nomeColaborador}` : ''}{nomeFantasia ? ` (${nomeFantasia})` : ''} para processamento de pagamento.
        </Text>
        <Text style={detailsTitle}>Dados da Nota Fiscal:</Text>
        <Text style={detailItem}>
          <strong>Número da NF:</strong> {numeroNF || '—'}
        </Text>
        <Text style={detailItem}>
          <strong>Valor:</strong> {valor || '—'}
        </Text>
        <Text style={detailItem}>
          <strong>Data de Vencimento:</strong> {dataVencimento || '—'}
        </Text>
        <Text style={detailItem}>
          <strong>Prestador:</strong> {nomeColaborador || '—'}
        </Text>
        {notaFiscalId && (
          <Section style={buttonSection}>
            <Button style={downloadButton} href={`${APP_URL}/notas-fiscais/${notaFiscalId}`}>
              Abrir a NF no sistema
            </Button>
          </Section>
        )}
        <Text style={text}>
          O arquivo da nota fiscal fica disponível na tela da NF no sistema (é necessário estar logado).
        </Text>

        <Text style={text}>
          Após o pagamento, favor enviar o comprovante para rh.corp@fetelycorp.com.br
        </Text>
        <Text style={text}>
          Em caso de dúvidas, entre em contato com o departamento financeiro.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          Atenciosamente,<br />
          Equipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NFPagamentoEmail,
  subject: (data: Record<string, any>) => `[Fetely] - NF para pagamento${data.nomeFantasia ? ` - ${data.nomeFantasia}` : ''}`,
  displayName: 'NF para Pagamento',
  previewData: {
    nomeColaborador: 'João Silva',
    nomeFantasia: 'Empresa XYZ',
    numeroNF: '12345',
    valor: 'R$ 5.000,00',
    dataVencimento: '15/01/2025',
    arquivoUrl: 'https://example.com/nf.pdf',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 16px' }
const detailsTitle = { fontSize: '15px', color: '#1a3a5c', fontWeight: 'bold' as const, margin: '16px 0 8px' }
const detailItem = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 4px' }
const buttonSection = { margin: '20px 0', textAlign: 'center' as const }
const downloadButton = {
  backgroundColor: '#1a3a5c',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#999999', margin: '0', lineHeight: '1.5' }
