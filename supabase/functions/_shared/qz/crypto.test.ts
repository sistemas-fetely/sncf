import { assertEquals } from "jsr:@std/assert";
import { X509Certificate } from "npm:@peculiar/x509@1.14.2";
import { assinarQz, gerarParQz } from "./crypto.ts";

Deno.test("QZ: RSA 2048, certificado SHA256 por dez anos e assinatura SHA512 verificável", async () => {
  const par = await gerarParQz(new Date("2026-11-11T15:22:00Z"));
  const cert = new X509Certificate(par.certificado);
  assertEquals(cert.subject.includes("CN=sncf.lovable.app"), true);
  assertEquals(cert.subject.includes("O=Fetely"), true);
  assertEquals(cert.notAfter.toISOString(), "2036-11-11T15:22:00.000Z");
  assertEquals(cert.signatureAlgorithm, { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } });
  const publicKey = await cert.publicKey.export({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" }, ["verify"]);
  assertEquals((publicKey.algorithm as RsaKeyAlgorithm).modulusLength, 2048);
  const assinatura = Uint8Array.from(atob(await assinarQz(par.chave, "teste QZ")), c => c.charCodeAt(0));
  assertEquals(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, assinatura, new TextEncoder().encode("teste QZ")), true);
  assertEquals(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, assinatura, new TextEncoder().encode("outro texto")), false);
});