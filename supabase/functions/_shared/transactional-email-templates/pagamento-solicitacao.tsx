import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Row, Column, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Fetely People"

interface DocLink {
  tipo?: string
  nome?: string
  url?: string
}

interface ParcelaItem {
  numero?: string
  valor?: string
  vencimento?: string
}

interface PagamentoSolicitacaoProps {
  fornecedor?: string
  valor?: string
  vencimento?: string
  parcelas?: ParcelaItem[]
  valor_total?: string
  forma_pagamento_nome?: string
  nf_numero?: string
  categoria?: string
  banco?: string
  agencia?: string
  conta_bancaria?: string
  pix?: string
  observacao?: string
  mensagem_personalizada?: string
  documentos_links?: DocLink[]
  solicitante?: string
}

const PagamentoSolicitacaoEmail = ({
  fornecedor,
  valor,
  vencimento,
  parcelas,
  valor_total,
  forma_pagamento_nome,
  nf_numero,
  categoria,
  banco,
  agencia,
  conta_bancaria,
  pix,
  observacao,
  mensagem_personalizada,
  documentos_links,
  solicitante,
}: PagamentoSolicitacaoProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Solicitação de pagamento — {fornecedor || ''} — {valor || ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Solicitação de Pagamento</Heading>

        {/* Mensagem personalizada do solicitante (preserva quebras de linha) */}
        {mensagem_personalizada ? (
          <Section style={mensagemBox}>
            {mensagem_personalizada.split('\n').map((linha, i) => (
              <Text key={i} style={text}>{linha || '\u00A0'}</Text>
            ))}
          </Section>
        ) : (
          <>
            <Text style={text}>Prezado(a),</Text>
            <Text style={text}>
              Segue solicitação de pagamento aprovada{solicitante ? ` por ${solicitante}` : ''}.
              Por favor, processe e devolva o comprovante.
            </Text>
          </>
        )}

        {parcelas && parcelas.length > 0 ? (
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Resumo — {forma_pagamento_nome || 'Parcelado'} ({parcelas.length}x)
            </Heading>
            <Row>
              <Column style={labelCol}><Text style={labelText}>Fornecedor</Text></Column>
              <Column><Text style={valueText}>{fornecedor || '—'}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={labelText}>Valor total</Text></Column>
              <Column><Text style={valueStrong}>{valor_total || '—'}</Text></Column>
            </Row>
            {nf_numero && nf_numero !== '—' && (
              <Row>
                <Column style={labelCol}><Text style={labelText}>NF</Text></Column>
                <Column><Text style={valueText}>{nf_numero}</Text></Column>
              </Row>
            )}
            {categoria && categoria !== '—' && (
              <Row>
                <Column style={labelCol}><Text style={labelText}>Categoria</Text></Column>
                <Column><Text style={valueText}>{categoria}</Text></Column>
              </Row>
            )}
            <Hr style={hrInner} />
            <Text style={labelText}>Parcelas</Text>
            {parcelas.map((p, i) => (
              <Row key={i} style={parcelaRow}>
                <Column style={parcelaNumCol}><Text style={parcelaNum}>{p.numero || '—'}</Text></Column>
                <Column style={parcelaVencCol}><Text style={parcelaText}>{p.vencimento || '—'}</Text></Column>
                <Column style={parcelaValorCol}><Text style={parcelaValor}>{p.valor || '—'}</Text></Column>
              </Row>
            ))}
          </Section>
        ) : (
          <Section style={card}>
            <Heading as="h2" style={h2}>Resumo</Heading>
            <Row>
              <Column style={labelCol}><Text style={labelText}>Fornecedor</Text></Column>
              <Column><Text style={valueText}>{fornecedor || '—'}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={labelText}>Valor</Text></Column>
              <Column><Text style={valueStrong}>{valor || '—'}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={labelText}>Vencimento</Text></Column>
              <Column><Text style={valueText}>{vencimento || '—'}</Text></Column>
            </Row>
            {forma_pagamento_nome && forma_pagamento_nome !== '—' && (
              <Row>
                <Column style={labelCol}><Text style={labelText}>Forma</Text></Column>
                <Column><Text style={valueText}>{forma_pagamento_nome}</Text></Column>
              </Row>
            )}
            {nf_numero && nf_numero !== '—' && (
              <Row>
                <Column style={labelCol}><Text style={labelText}>NF</Text></Column>
                <Column><Text style={valueText}>{nf_numero}</Text></Column>
              </Row>
            )}
            {categoria && categoria !== '—' && (
              <Row>
                <Column style={labelCol}><Text style={labelText}>Categoria</Text></Column>
                <Column><Text style={valueText}>{categoria}</Text></Column>
              </Row>
            )}
          </Section>
        )}

        <Section style={card}>
          <Heading as="h2" style={h2}>Dados bancários do fornecedor</Heading>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Banco</Text></Column>
            <Column><Text style={valueText}>{banco || '—'}</Text></Column>
          </Row>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Agência</Text></Column>
            <Column><Text style={valueText}>{agencia || '—'}</Text></Column>
          </Row>
          <Row>
            <Column style={labelCol}><Text style={labelText}>Conta</Text></Column>
            <Column><Text style={valueText}>{conta_bancaria || '—'}</Text></Column>
          </Row>
          <Row>
            <Column style={labelCol}><Text style={labelText}>PIX</Text></Column>
            <Column><Text style={valueText}>{pix || '—'}</Text></Column>
          </Row>
        </Section>

        {/* Documentos como links assinados */}
        {documentos_links && documentos_links.length > 0 && (
          <Section style={card}>
            <Heading as="h2" style={h2}>Documentos anexados</Heading>
            <Text style={textSmall}>
              Clique nos links abaixo para baixar os documentos (válidos por 30 dias):
            </Text>
            {documentos_links.map((doc, i) => (
              <Row key={i} style={{ marginBottom: '6px' }}>
                <Column>
                  <Text style={docItem}>
                    <span style={docTipo}>[{doc.tipo || 'Doc'}]</span>{' '}
                    {doc.url ? (
                      <Link href={doc.url} style={docLink}>
                        {doc.nome || 'Documento'}
                      </Link>
                    ) : (
                      <span>{doc.nome || 'Documento'}</span>
                    )}
                  </Text>
                </Column>
              </Row>
            ))}
          </Section>
        )}

        {observacao && observacao !== '—' && (
          <Section style={obsBox}>
            <Text style={labelText}>Observação interna</Text>
            <Text style={text}>{observacao}</Text>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          Atenciosamente,<br />
          {solicitante || `Equipe ${SITE_NAME}`}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PagamentoSolicitacaoEmail,
  subject: (data: Record<string, any>) =>
    `[Fetely] Pagamento — ${data.fornecedor || 'Fornecedor'} — ${data.valor || ''}`,
  displayName: 'Solicitação de Pagamento',
  previewData: {
    fornecedor: 'F SIME ASSESSORIA E TREINAMENTO EMPRESARIAL LTDA',
    valor_total: 'R$ 1.800,00',
    forma_pagamento_nome: 'Boleto Bancário',
    parcelas: [
      { numero: '1/3', valor: 'R$ 600,00', vencimento: '16/05/2026' },
      { numero: '2/3', valor: 'R$ 600,00', vencimento: '16/06/2026' },
      { numero: '3/3', valor: 'R$ 600,00', vencimento: '16/07/2026' },
    ],
    nf_numero: '—',
    categoria: 'Treinamentos',
    banco: 'Itaú',
    agencia: '1234',
    conta_bancaria: '56789-0',
    pix: 'cnpj@empresa.com.br',
    observacao: 'Boletos pré-agendados no banco.',
    mensagem_personalizada: 'Segue solicitação de pagamento conforme aprovado.',
    documentos_links: [
      { tipo: 'Boleto', nome: 'boleto-1de3.pdf', url: 'https://example.com/boleto1.pdf' },
    ],
    solicitante: 'Flávio',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 20px' }
const h2 = { fontSize: '15px', fontWeight: 'bold' as const, color: '#1a3a5c', margin: '0 0 10px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 8px' }
const textSmall = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 10px' }
const mensagemBox = { padding: '14px 16px', backgroundColor: '#fafbfc', borderRadius: '8px', margin: '0 0 16px', border: '1px solid #e5e7eb' }
const card = { padding: '14px 16px', backgroundColor: '#f7f9fc', borderRadius: '8px', margin: '0 0 14px', border: '1px solid #e5e7eb' }
const obsBox = { padding: '12px 16px', backgroundColor: '#fffaf0', borderRadius: '8px', margin: '0 0 14px', border: '1px solid #fde9c4' }
const labelCol = { width: '120px', verticalAlign: 'top' as const }
const labelText = { fontSize: '12px', color: '#6b7280', margin: '4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const valueText = { fontSize: '14px', color: '#1a3a5c', margin: '4px 0' }
const valueStrong = { fontSize: '16px', color: '#1a3a5c', margin: '4px 0', fontWeight: 'bold' as const }
const docItem = { fontSize: '14px', margin: '2px 0', lineHeight: '1.5' }
const docTipo = { display: 'inline-block', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold' as const, marginRight: '6px' }
const docLink = { color: '#1d4ed8', textDecoration: 'underline' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const hrInner = { borderColor: '#e5e7eb', margin: '12px 0' }
const footer = { fontSize: '13px', color: '#999999', margin: '0', lineHeight: '1.5' }
const parcelaRow = { marginBottom: '4px' }
const parcelaNumCol = { width: '50px', verticalAlign: 'middle' as const }
const parcelaVencCol = { verticalAlign: 'middle' as const }
const parcelaValorCol = { textAlign: 'right' as const, verticalAlign: 'middle' as const }
const parcelaNum = { fontSize: '13px', color: '#6b7280', margin: '2px 0', fontWeight: 'bold' as const }
const parcelaText = { fontSize: '13px', color: '#3a3a4a', margin: '2px 0' }
const parcelaValor = { fontSize: '14px', color: '#1a3a5c', margin: '2px 0', fontWeight: 'bold' as const }
