/// <reference types="npm:@types/react@18.3.1" />
import * as React from "npm:react@18.3.1";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from "npm:@react-email/components@0.0.22";
import type { TemplateEntry } from "./registry.ts";

interface Props {
  nome?: string;
  link?: string;
}

const COR_VERDE = "#1a3d2b";
const COR_CREME = "#F5F0E8";

const RecuperacaoSenha = ({
  nome = "colaborador(a)",
  link = "https://sncf.lovable.app/reset-password",
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Recuperação de senha — People Fetely</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>Fetély.</Heading>
        </Section>

        <Section style={content}>
          <Heading style={h1}>Recuperação de senha</Heading>

          <Text style={text}>
            Oi, {nome.split(" ")[0]}. Recebemos um pedido para redefinir sua senha
            no <strong>People Fetely</strong>. Se foi você, clica no botão abaixo:
          </Text>

          <Section style={btnContainer}>
            <Button style={button} href={link}>
              Definir nova senha
            </Button>
          </Section>

          <Text style={smallText}>
            Este link expira em <strong>1 hora</strong> por segurança.
          </Text>

          <Hr style={hr} />

          <Text style={text}>
            Se não foi você que pediu, ignore este email — sua senha atual continua
            válida e segura. Se isso acontecer muitas vezes, fale com o RH pra
            gente investigar.
          </Text>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            #celebreoqueimporta · Fetely
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: RecuperacaoSenha,
  subject: "Recuperação de senha — People Fetely",
  displayName: "Recuperação de senha",
  previewData: {
    nome: "Bruna Foshi",
    link: "https://sncf.lovable.app/reset-password",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif", margin: 0, padding: 0 };
const container = { maxWidth: "560px", margin: "0 auto", backgroundColor: "#ffffff" };
const header = { backgroundColor: COR_CREME, padding: "32px 24px", textAlign: "center" as const };
const brand = { fontSize: "32px", fontWeight: "bold", color: COR_VERDE, fontFamily: "Georgia, serif", margin: 0 };
const content = { padding: "32px 24px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: COR_VERDE, margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#4a4a4a", lineHeight: "1.6", margin: "0 0 16px" };
const smallText = { fontSize: "12px", color: "#6b6b6b", lineHeight: "1.5", margin: "0 0 16px" };
const btnContainer = { textAlign: "center" as const, margin: "24px 0" };
const button = { backgroundColor: COR_VERDE, color: "#ffffff", padding: "14px 32px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "14px", display: "inline-block" };
const hr = { borderColor: "#e6e6e6", margin: "24px 0" };
const footer = { padding: "16px 24px", textAlign: "center" as const, backgroundColor: COR_CREME };
const footerText = { fontSize: "11px", color: "#6b6b6b", margin: 0 };
