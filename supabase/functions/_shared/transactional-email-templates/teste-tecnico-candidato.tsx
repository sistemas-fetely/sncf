/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'

interface Props {
  nome?: string
  cargo?: string
  contexto?: string
  descricao?: string
  entregaveis?: string
  criterios?: string
  prazo?: string
  link_portal?: string
}

export function TesteTecnicoCandidato({
  nome = "Candidato",
  cargo = "a vaga",
  contexto = "",
  descricao = "",
  entregaveis = "",
  criterios = "",
  prazo = "",
  link_portal = "",
}: Props) {
  const primeiroNome = nome.split(" ")[0]
  return (
    <Html>
      <Head />
      <Preview>Teste técnico — {cargo} na Fetely</Preview>
      <Body style={{ backgroundColor: "#F9FAFB", fontFamily: "Inter, Arial, sans-serif", padding: "40px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: "#0891B2", padding: "24px 32px" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, margin: 0 }}>
              Fetély.
            </Text>
            <Text style={{ color: "#E0F2FE", fontSize: 12, margin: "4px 0 0" }}>
              Vamos celebrar!! Venha criar algo novo...
            </Text>
          </Section>

          <Section style={{ padding: "32px" }}>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>
              Teste Técnico — {cargo}
            </Text>
            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 16px" }}>
              Olá, {primeiroNome}! 🎯
            </Text>
            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 20px", lineHeight: "1.6" }}>
              Você avançou para a etapa de teste técnico no processo seletivo da Fetely. Preparamos um desafio especialmente para você.
            </Text>

            {contexto && (
              <Section style={{ backgroundColor: "#F0F9FF", borderRadius: 8, padding: "16px", margin: "0 0 16px" }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 4px", textTransform: "uppercase" as const }}>
                  Contexto
                </Text>
                <Text style={{ fontSize: 14, color: "#334155", margin: 0, lineHeight: "1.6" }}>
                  {contexto}
                </Text>
              </Section>
            )}

            <Section style={{ backgroundColor: "#ECFEFF", borderRadius: 8, padding: "16px", margin: "0 0 16px" }}>
              <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 4px", textTransform: "uppercase" as const }}>
                O desafio
              </Text>
              <Text style={{ fontSize: 14, color: "#334155", margin: 0, lineHeight: "1.6", whiteSpace: "pre-wrap" as const }}>
                {descricao}
              </Text>
            </Section>

            {entregaveis && (
              <Section style={{ backgroundColor: "#F0F9FF", borderRadius: 8, padding: "16px", margin: "0 0 16px" }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 4px", textTransform: "uppercase" as const }}>
                  Entregáveis
                </Text>
                <Text style={{ fontSize: 14, color: "#334155", margin: 0, lineHeight: "1.6" }}>
                  {entregaveis}
                </Text>
              </Section>
            )}

            {criterios && (
              <Section style={{ backgroundColor: "#F0F9FF", borderRadius: 8, padding: "16px", margin: "0 0 16px" }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 4px", textTransform: "uppercase" as const }}>
                  Critérios de avaliação
                </Text>
                <Text style={{ fontSize: 14, color: "#334155", margin: 0, lineHeight: "1.6" }}>
                  {criterios}
                </Text>
              </Section>
            )}

            <Section style={{ backgroundColor: "#FFF7ED", borderRadius: 8, padding: "16px", margin: "0 0 20px", textAlign: "center" as const }}>
              <Text style={{ fontSize: 14, fontWeight: 600, color: "#D97706", margin: 0 }}>
                ⏰ Prazo de entrega: {prazo}
              </Text>
            </Section>

            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 8px", lineHeight: "1.6" }}>
              Qualquer dúvida, entre em contato respondendo este e-mail.
            </Text>

            {link_portal && (
              <Section style={{ backgroundColor: "#ECFEFF", borderRadius: 8, padding: "16px", margin: "0 0 16px", textAlign: "center" as const }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 8px", textTransform: "uppercase" as const }}>
                  Como entregar seu teste
                </Text>
                <Text style={{ fontSize: 13, color: "#334155", margin: "0 0 12px", lineHeight: "1.5" }}>
                  Acesse o link abaixo, faça upload do seu arquivo ou cole o link da sua entrega (Google Drive, GitHub, Notion, etc.):
                </Text>
                <Button
                  href={`${link_portal}/teste`}
                  style={{
                    backgroundColor: "#0891B2",
                    color: "#FFFFFF",
                    padding: "10px 24px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Entregar meu teste →
                </Button>
              </Section>
            )}

            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 0", lineHeight: "1.6" }}>
              Boa sorte! Estamos torcendo por você. ✨
            </Text>
          </Section>

          <Hr style={{ borderColor: "#E2E8F0", margin: 0 }} />

          <Section style={{ padding: "16px 32px" }}>
            <Text style={{ fontSize: 11, color: "#94A3B8", margin: 0, textAlign: "center" as const }}>
              Fetely · Vamos celebrar!! Venha criar algo novo...
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TesteTecnicoCandidato,
  subject: (data: Record<string, any>) => `Seu teste técnico — ${data.cargo ?? "a vaga"} na Fetely`,
  previewData: {
    nome: "Maria Silva",
    cargo: "Analista de Design Jr",
    contexto: "A Fetely está lançando uma nova linha de produtos comemorativa...",
    descricao: "Crie uma proposta de identidade visual para embalagem de presente premium.",
    entregaveis: "PDF com no mínimo 3 alternativas de layout",
    criterios: "Aderência ao DNA Fetely, criatividade, execução técnica",
    prazo: "20/04/2026",
    link_portal: "https://sncf.lovable.app/vagas/abc123",
  },
}
