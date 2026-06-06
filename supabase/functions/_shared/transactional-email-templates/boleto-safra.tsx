import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface BoletoSafraProps {
  parceiro_nome?: string
  numero_parcela?: string
  total_parcelas?: string
  valor?: string
  vencimento?: string
  linha_digitavel?: string
  pedido_id_externo?: string
}

const BoletoSafraEmail = ({
  parceiro_nome,
  numero_parcela,
  total_parcelas,
  valor,
  vencimento,
  linha_digitavel,
  pedido_id_externo,
}: BoletoSafraProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Fetély · Boleto {numero_parcela}/{total_parcelas} — Vencimento {vencimento}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header verde */}
        <Section style={headerSection}>
          <Text style={headerBrand}>Fetély.</Text>
        </Section>

        {/* Corpo */}
        <Section style={bodySection}>
          <Text style={celebrationText}>
            Toda grande celebração começa com uma escolha...
          </Text>
          <Text style={celebrationSub}>
            A sua já foi feita!
          </Text>

          <Text style={greetingText}>
            Olá, {parceiro_nome || 'cliente'}. Segue abaixo o boleto referente ao pedido {pedido_id_externo || ''}.
          </Text>
        </Section>

        {/* Card do boleto */}
        <Section style={cardSection}>
          <Row>
            <Column style={cardLabel}>Parcela</Column>
            <Column style={cardValue}>{numero_parcela}/{total_parcelas}</Column>
          </Row>
          <Row>
            <Column style={cardLabel}>Valor</Column>
            <Column style={cardValue}>{valor}</Column>
          </Row>
          <Row>
            <Column style={cardLabel}>Vencimento</Column>
            <Column style={cardValue}>{vencimento}</Column>
          </Row>
        </Section>

        <Section style={linhaSection}>
          <Text style={linhaLabel}>Linha digitável</Text>
          <Text style={linhaValue}>{linha_digitavel || '—'}</Text>
        </Section>

        <Section style={instructionsSection}>
          <Text style={instructionsText}>
            Pagável em qualquer banco, aplicativo bancário ou internet banking até a data de vencimento.
          </Text>
        </Section>

        <Hr style={hr} />

        {/* Rodapé */}
        <Section style={footerSection}>
          <Text style={footerText}>
            Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
          </Text>
          <Text style={footerText}>
            Dúvidas? Entre em contato com nossa equipe comercial.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: BoletoSafraEmail,
  subject: (data) => `Fetély · Boleto ${data.numero_parcela || ''}/${data.total_parcelas || ''} — Vencimento ${data.vencimento || ''}`,
  displayName: 'Boleto Safra',
  previewData: {
    parceiro_nome: 'Loja das Festas Ltda',
    numero_parcela: '1',
    total_parcelas: '3',
    valor: 'R$ 1.200,00',
    vencimento: '15/06/2026',
    linha_digitavel: '42297.11504 00000.012140 00000.001251 7 55550000070599',
    pedido_id_externo: 'FOP-00123',
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
