import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Html, Preview, Text, Hr, Section, Row, Column, Heading, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface CobrancaPedidoProps {
  parceiro_nome?: string
  pedido_id_externo?: string
  data_pedido?: string
  forma_pagamento?: string
  condicao_pagamento?: string
  valor_bruto?: string
  desconto?: string
  valor_frete?: string
  valor_liquido?: string
  link_pagamento?: string
}

const Verde = '#2d5a27'
const Creme = '#f0ecd8'
const TextoVerde = '#2d4a24'

const CobrancaPedidoEmail = ({
  parceiro_nome,
  pedido_id_externo,
  data_pedido,
  forma_pagamento,
  condicao_pagamento,
  valor_bruto,
  desconto,
  valor_frete,
  valor_liquido,
  link_pagamento,
}: CobrancaPedidoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Fetély · Toda grande celebração começa com uma escolha... A sua já foi feita!</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header verde */}
        <Section style={headerTop} />

        {/* Badge logo */}
        <Section style={logoSection}>
          <div style={badgeWrap}>
            <Text style={badgeName}>Fetély.</Text>
          </div>
        </Section>

        {/* Banner verde inferior do header */}
        <Section style={headerBottom} />

        {/* Corpo principal */}
        <Section style={body}>
          <Text style={headline}>
            Toda grande celebração começa<br />
            com uma escolha...<br />
            <span style={highlight}>A sua já foi feita!</span>
          </Text>

          <Text style={subline}>
            Siga as instruções abaixo para concluir o seu pedido.
          </Text>

          <Hr style={divider} />

          {/* Dados do pedido */}
          <Section style={cardSection}>
            {parceiro_nome && (
              <Row style={infoRow}>
                <Column style={infoLabel}>Cliente</Column>
                <Column style={infoValue}>{parceiro_nome}</Column>
              </Row>
            )}
            {pedido_id_externo && (
              <Row style={infoRow}>
                <Column style={infoLabel}>Pedido</Column>
                <Column style={infoValue}>{pedido_id_externo}</Column>
              </Row>
            )}
            {data_pedido && (
              <Row style={infoRow}>
                <Column style={infoLabel}>Data</Column>
                <Column style={infoValue}>{data_pedido}</Column>
              </Row>
            )}
            {forma_pagamento && (
              <Row style={infoRow}>
                <Column style={infoLabel}>Pagamento</Column>
                <Column style={infoValue}>
                  {forma_pagamento}{condicao_pagamento ? ` · ${condicao_pagamento}` : ''}
                </Column>
              </Row>
            )}
          </Section>




          {/* Resumo financeiro */}
          <Section style={resumoSection}>
            {valor_bruto && (
              <Row>
                <Column style={resumoLabel}>Valor bruto</Column>
                <Column style={resumoValor}>{valor_bruto}</Column>
              </Row>
            )}
            {desconto && (
              <Row>
                <Column style={resumoLabel}>Desconto</Column>
                <Column style={resumoValor}>{desconto}</Column>
              </Row>
            )}
            {valor_frete && (
              <Row>
                <Column style={resumoLabel}>Frete</Column>
                <Column style={resumoValor}>{valor_frete}</Column>
              </Row>
            )}
            {valor_liquido && (
              <Row>
                <Column style={{ ...resumoLabel, fontWeight: 700, color: TextoVerde }}>Total</Column>
                <Column style={{ ...resumoValor, fontWeight: 700, color: TextoVerde }}>{valor_liquido}</Column>
              </Row>
            )}
          </Section>

          {/* CTA pagamento */}
          {link_pagamento && (
            <Section style={{ textAlign: 'center', marginTop: '28px', marginBottom: '16px' }}>
              <Button href={link_pagamento} style={ctaButton}>
                Realizar Pagamento
              </Button>
              <Text style={ctaNote}>O PDF completo do pedido está em anexo neste email.</Text>
            </Section>
          )}

          {!link_pagamento && (
            <Section style={{ marginTop: '24px', marginBottom: '16px' }}>
              <Text style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
                O PDF completo do pedido está em anexo neste email.
              </Text>
              <Text style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
                Siga as instruções de pagamento conforme combinado com nossa equipe comercial.
              </Text>
            </Section>
          )}
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            Fetely Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48
          </Text>
          <Text style={{ ...footerText, fontWeight: 700, color: '#ffffff' }}>
            #celebreoqueimporta
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#f4f4f0', fontFamily: 'Georgia, serif' }
const container = { maxWidth: '580px', margin: '0 auto', backgroundColor: '#ffffff' }
const headerTop = { backgroundColor: Verde, height: '60px', display: 'block' }
const logoSection = { backgroundColor: '#ffffff', textAlign: 'center' as const, padding: '24px 0 16px' }
const badgeWrap = {
  display: 'inline-block',
  backgroundColor: Creme,
  border: `2px solid ${Verde}`,
  borderRadius: '50px 50px 50px 50px',
  padding: '12px 28px',
  margin: '0 auto',
}
const badgeName = { fontSize: '28px', color: TextoVerde, margin: '0', fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: '700' }
const headerBottom = { backgroundColor: Verde, height: '12px', display: 'block' }
const body = { padding: '36px 40px 24px' }
const headline = { fontSize: '22px', color: TextoVerde, lineHeight: '1.5', textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: '400', margin: '0 0 16px' }
const highlight = { fontWeight: '700' }
const subline = { fontSize: '15px', color: '#444', textAlign: 'center' as const, marginBottom: '28px', lineHeight: '1.6' }
const divider = { borderColor: '#e5e0d0', margin: '0 0 24px' }
const cardSection = { backgroundColor: '#faf8f3', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }
const infoRow = { marginBottom: '8px' }
const infoLabel = { fontSize: '12px', color: '#888', width: '40%', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const infoValue = { fontSize: '14px', color: '#222', fontWeight: '600' }
const sectionTitle = { fontSize: '13px', fontWeight: '700', color: TextoVerde, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '8px' }
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }
const thStyle = { backgroundColor: Verde, color: '#fff', padding: '8px 10px', textAlign: 'left' as const, fontWeight: '600', fontSize: '12px' }
const tdStyle = { padding: '7px 10px', color: '#333', borderBottom: '1px solid #eee' }
const trEvenStyle = { backgroundColor: '#ffffff' }
const trOddStyle = { backgroundColor: '#f9f7f2' }
const resumoSection = { backgroundColor: '#faf8f3', borderRadius: '8px', padding: '16px 20px', marginTop: '20px' }
const resumoLabel = { fontSize: '13px', color: '#666', paddingBottom: '6px' }
const resumoValor = { fontSize: '13px', color: '#222', textAlign: 'right' as const, paddingBottom: '6px' }
const ctaButton = { backgroundColor: Verde, color: '#ffffff', fontSize: '15px', fontWeight: '700', padding: '14px 36px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block' }
const ctaNote = { fontSize: '12px', color: '#888', textAlign: 'center' as const, marginTop: '12px' }
const footer = { backgroundColor: Verde, padding: '20px 32px' }
const footerText = { fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: '0 0 4px', textAlign: 'center' as const }

export const template: TemplateEntry = {
  component: CobrancaPedidoEmail,
  subject: (data) => `Fetély · Seu pedido está pronto para pagamento${data.pedido_id_externo ? ` · ${data.pedido_id_externo}` : ''}`,
  displayName: 'Cobrança ao Cliente (Pedido)',
  previewData: {
    parceiro_nome: 'Bella Decorações',
    pedido_id_externo: 'PED-1780516269250',
    data_pedido: '03/06/2026',
    forma_pagamento: 'Boleto',
    condicao_pagamento: '0/30 (2x)',
    valor_bruto: 'R$ 5.006,65',
    desconto: '-R$ 150,20',
    valor_frete: '+R$ 242,82',
    valor_liquido: 'R$ 5.099,27',
    itens: [
      { descricao: 'Travessa Retangular Lemon Blue 30cm', quantidade: 3, valor_unitario: 23.47, subtotal: 70.41 },
      { descricao: 'Prato Sobremesa Azul', quantidade: 6, valor_unitario: 18.50, subtotal: 111.00 },
    ],
  },
}
