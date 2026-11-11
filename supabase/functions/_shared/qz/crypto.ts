import { X509CertificateGenerator } from "npm:@peculiar/x509@1.14.2";

export const ALGORITMO_QZ = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
export function base64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
export async function gerarParQz(agora = new Date()) {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"]);
  const fim = new Date(agora); fim.setUTCFullYear(fim.getUTCFullYear() + 10);
  const cert = await X509CertificateGenerator.createSelfSigned({
    name: "CN=sncf.lovable.app, O=Fetely", keys,
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    notBefore: agora, notAfter: fim,
    serialNumber: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""),
  });
  const pkcs8 = base64(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  return { certificado: cert.toString("pem").trim(), chave: `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----` };
}
export async function assinarQz(pem: string, toSign: string) {
  const binario = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(binario, c => c.charCodeAt(0)), ALGORITMO_QZ, false, ["sign"]);
  return base64(await crypto.subtle.sign(ALGORITMO_QZ, key, new TextEncoder().encode(toSign)));
}