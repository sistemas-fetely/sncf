/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Hr, Html, Preview, Section, Text, Button } from 'npm:@react-email/components@0.0.22'

interface Props {
  nome_candidato?: string
  cargo?: string
  link_entrega?: string
  link_sistema?: string
}

export function TesteTecnicoEntregue({
  nome_candidato = "Candidato",
  cargo = "a vaga",
  link_entrega = "",
  link_sistema = "",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Entrega recebida — {nome_candidato} · {cargo}</Preview>
      <Body style={{ backgroundColor: "#F9FAFB", fontFamily: "Inter, Arial, sans-serif", padding: "40px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: "#1A3A5C", padding: "20px 32px" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 700, margin: 0 }}>
              Fetély. · RH
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 11, margin: "4px 0 0" }}>
              Notificação interna
            </Text>
          </Section>

          <Section style={{ padding: "32px" }}>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>
              Teste técnico entregue
            </Text>
            <Text style={{ fontSize: 14, color: "#0891B2", fontWeight: 600, margin: "0 0 16px" }}>
              {nome_candidato} enviou a entrega
            </Text>
            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 20px", lineHeight: "1.6" }}>
              O candidato {nome_candidato} enviou a entrega do teste técnico para a vaga de <strong>{cargo}</strong>. Acesse o sistema para avaliar.
            </Text>

            {link_entrega && (
              <Section style={{ backgroundColor: "#F0F9FF", borderRadius: 8, padding: "12px 16px", margin: "0 0 16px" }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: "#0891B2", margin: "0 0 4px" }}>
                  Link da entrega
                </Text>
                <Text style={{ fontSize: 13, color: "#334155", margin: 0, wordBreak: "break-all" as const }}>
                  {link_entrega}
                </Text>
              </Section>
            )}

            {link_sistema && (
              <Button
                href={link_sistema}
                style={{
                  backgroundColor: "#0891B2",
                  color: "#FFFFFF",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Avaliar no sistema →
              </Button>
            )}
          </Section>

          <Hr style={{ borderColor: "#E2E8F0", margin: 0 }} />

          <Section style={{ padding: "16px 32px" }}>
            <Text style={{ fontSize: 11, color: "#94A3B8", margin: 0, textAlign: "center" as const }}>
              Fetely · Sistema interno de RH
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TesteTecnicoEntregue,
  subject: (data: Record<string, any>) =>
    `Entrega recebida — ${data.nome_candidato ?? "Candidato"} · ${data.cargo ?? ""}`,
  previewData: {
    nome_candidato: "Maria Silva",
    cargo: "Analista de Design Jr",
    link_entrega: "https://drive.google.com/exemplo",
    link_sistema: "https://sncf.lovable.app/recrutamento",
  },
}
