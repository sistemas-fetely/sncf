import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Preview, Text, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ParcelaLote {
  parcela?: string
  vencimento?: string
  valor?: string
  linha_digitavel?: string
}

interface BoletoSafraLoteProps {
  parceiro_nome?: string
  numero_acordo?: string | null
  pedido_id_externo?: string
  total?: string
  parcelas?: ParcelaLote[]
}

const BoletoSafraLoteEmail = ({
  parceiro_nome, numero_acordo, pedido_id_externo, total, parcelas = [],
}: BoletoSafraLoteProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Fetély · {parcelas.length} boletos{numero_acordo ? ` — acordo ${numero_acordo}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={headerBrand}>Fetély.</Text>
        </Section>

        <Section style={bodySection}>
          <Text style={celebrationText}>Toda grande celebração começa com uma escolha...</Text>
          <Text style={celebrationSub}>A sua já foi feita!</Text>
          <Text style={greetingText}>
            Olá, {parceiro_nome || 'cliente'}. Seguem os boletos {numero_acordo ? `do acordo ${numero_acordo}` : `do pedido ${pedido_id_externo || ''}`}.
          </Text>
        </Section>

        <Section style={cardSection}>
          <Row>
            <Column style={thCell}>Parcela</Column>
            <Column style={thCell}>Vencimento</Column>
            <Column style={{ ...thCell, textAlign: 'right' as const }}>Valor</Column>
          </Row>
          {parcelas.map((p, i) => (
            <Section key={i} style={linhaParcela}>
              <Row>
                <Column style={tdCell}>{p.parcela}</Column>
                <Column style={tdCell}>{p.vencimento}</Column>
                <Column style={{ ...tdCell, textAlign: 'right' as const }}>{p.valor}</Column>
              </Row>
              <Text style={linhaValueSm}>{p.linha_digitavel || '—'}</Text>
            </Section>
          ))}
          <Row>
            <Column style={cardLabel}>Total</Column>
            <Column style={cardValue}>{total}</Column>
          </Row>
        </Section>

        <Hr style={hr} />

        <Section style={footerSection}>
          <Text style={footerText}>
            Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
          </Text>
          <Text style={footerText}>Dúvidas? Entre em contato com nossa equipe comercial.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: BoletoSafraLoteEmail,
  subject: (data) => data.numero_acordo
    ? `Boletos — acordo ${data.numero_acordo}`
    : `Boletos — pedido ${data.pedido_id_externo || ''}`,
  displayName: 'Boletos Safra (lote)',
  previewData: {
    parceiro_nome: 'Loja das Festas Ltda',
    numero_acordo: 'AC-2026-0007',
    pedido_id_externo: 'FOP-00123',
    total: 'R$ 2.400,00',
    parcelas: [
      { parcela: '1/2', vencimento: '15/11/2026', valor: 'R$ 1.200,00', linha_digitavel: '42297.11504 00000.012140 00000.001251 7 55550000070599' },
      { parcela: '2/2', vencimento: '15/12/2026', valor: 'R$ 1.200,00', linha_digitavel: '42297.11504 00000.012140 00000.001252 5 55860000070599' },
    ],
  },
}

const main = { backgroundColor: '#f5f5f5', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '0', maxWidth: '560px', backgroundColor: '#ffffff' }
const headerSection = { backgroundColor: '#1a7a5e', padding: '28px 24px', textAlign: 'center' as const }
const headerBrand = { color: '#ffffff', fontSize: '26px', fontWeight: 'bold' as const, margin: '0', letterSpacing: '1px' }
const bodySection = { padding: '28px 24px 12px' }
const celebrationText = { fontSize: '16px', color: '#1a7a5e', fontStyle: 'italic' as const, margin: '0 0 4px', textAlign: 'center' as const }
const celebrationSub = { fontSize: '18px', color: '#1a3a5c', fontWeight: 'bold' as const, margin: '0 0 20px', textAlign: 'center' as const }
const greetingText = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 8px' }
const cardSection = { backgroundColor: '#f8faf9', border: '1px solid #d4e8e1', borderRadius: '8px', padding: '20px 24px', margin: '0 24px 20px' }
const cardLabel = { fontSize: '13px', color: '#6b7280', textTransform: 'uppercase' as const, fontWeight: 'bold' as const, width: '40%' }
const cardValue = { fontSize: '15px', color: '#1a3a5c', fontWeight: 'bold' as const, width: '60%', textAlign: 'right' as const }
const linhaSection = { padding: '0 24px 16px' }
const linhaLabel = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, fontWeight: 'bold' as const, margin: '0 0 6px' }
const linhaValue = { fontSize: '16px', color: '#1a3a5c', fontFamily: "'Courier New', monospace", letterSpacing: '0.8px', margin: '0', wordBreak: 'break-all' as const }
const instructionsSection = { padding: '0 24px 16px' }
const instructionsText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '0 24px' }
const footerSection = { padding: '20px 24px 28px', textAlign: 'center' as const }
const footerText = { fontSize: '12px', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 4px' }

const thCell = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, fontWeight: 'bold' as const, paddingBottom: '6px' }
const tdCell = { fontSize: '14px', color: '#1a3a5c', fontWeight: 'bold' as const }
const linhaParcela = { borderTop: '1px solid #d4e8e1', padding: '8px 0' }
const linhaValueSm = { fontSize: '12px', color: '#1a3a5c', fontFamily: "'Courier New', monospace", margin: '4px 0 0', wordBreak: 'break-all' as const }
