/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Html, Head, Body, Container, Text, Hr,
} from 'npm:@react-email/components@0.0.22'

interface Props {
  lojista_nome?: string
  id_externo?: string
  qtd_skus?: number
}

function CatalogoLojista({
  lojista_nome = 'Lojista',
  id_externo = 'PED-XXX',
  qtd_skus = 0,
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f0e8', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: '32px auto', backgroundColor: '#ffffff', borderRadius: 8, padding: 40 }}>
          <Text style={{ fontSize: 11, color: '#1a3d2b', fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            FETELY
          </Text>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1a3d2b', marginTop: 0, marginBottom: 0 }}>
            Tabela de Cadastro de Produtos
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', marginTop: 16, marginBottom: 24 }} />
          <Text style={{ color: '#374151', lineHeight: '1.7' }}>
            Olá, <strong>{lojista_nome}</strong>!
          </Text>
          <Text style={{ color: '#374151', lineHeight: '1.7' }}>
            Segue em anexo a tabela de cadastro dos produtos do pedido{' '}
            <strong>{id_externo}</strong> ({qtd_skus} SKU{qtd_skus !== 1 ? 's' : ''}).
          </Text>
          <Text style={{ color: '#374151', lineHeight: '1.7' }}>
            Importe o arquivo Excel no seu sistema de gestão para registrar os produtos com
            SKU, EAN, NCM, CEST e todas as informações de classificação fiscal e comercial.
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', marginTop: 32, marginBottom: 16 }} />
          <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
            Fetely · <em>#celebreoqueimporta</em>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CatalogoLojista,
  subject: (data: Record<string, any>) =>
    `Tabela de Cadastro — Pedido ${data.id_externo ?? 'Fetely'}`,
}
