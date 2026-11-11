import qz from "qz-tray";
import { supabase } from "@/integrations/supabase/client";

const CHAVE_IMPRESSORA = "sncf.impressora.zebra";
export const ZPL_TESTE = "^XA^PW800^LL1200^FO50,50^A0N,60,60^FDTeste SNCF^FS^XZ";
let certificado: string | null = null;
let conectando: Promise<void> | null = null;
let impressoraMemoria: string | null = null;

export async function chamarQz<T>(funcao: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body });
  if (error) {
    const resposta = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(resposta?.erro ?? error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  return data as T;
}
export async function obterCertificadoQz() {
  if (!certificado) certificado = (await chamarQz<{ certificado: string }>("qz-certificado", { acao: "certificado" })).certificado;
  if (!certificado) throw new Error("Certificado QZ não disponível.");
  return certificado;
}
export async function gerarCertificadoQz() {
  certificado = (await chamarQz<{ certificado: string }>("qz-certificado", { acao: "gerar" })).certificado;
  return certificado;
}
qz.security.setCertificatePromise((resolve, reject) => { void obterCertificadoQz().then(resolve, reject); });
qz.security.setSignatureAlgorithm("SHA512");
qz.security.setSignaturePromise(async toSign => (await chamarQz<{ assinatura: string }>("qz-assinar", { toSign })).assinatura);

async function conectar() {
  if (qz.websocket.isActive()) return;
  if (!conectando) conectando = qz.websocket.connect({ retries: 0, delay: 0 }).finally(() => { conectando = null; });
  await conectando;
}
export async function qzDisponivel(): Promise<boolean> {
  try { await conectar(); return true; } catch { return false; }
}
export async function listarImpressoras(): Promise<string[]> {
  await conectar();
  const impressoras = await qz.printers.find();
  return Array.isArray(impressoras) ? impressoras : [impressoras];
}
export function escolherImpressora(impressoras: string[]) {
  let salva: string | null = impressoraMemoria;
  try { salva = localStorage.getItem(CHAVE_IMPRESSORA); } catch { /* Station storage unavailable. */ }
  return (salva && impressoras.includes(salva) ? salva : impressoras.find(nome => /ZDesigner|ZD220/i.test(nome))) ?? null;
}
export function salvarImpressora(nome: string) {
  impressoraMemoria = nome;
  try { localStorage.setItem(CHAVE_IMPRESSORA, nome); } catch { /* Selection still works in memory. */ }
}
export async function imprimirZpl(impressora: string, zpl: string) {
  if (!impressora || !zpl.trim()) throw new Error("Impressora ou etiqueta ZPL ausente.");
  await conectar();
  await qz.print(qz.configs.create(impressora), [{ type: "raw", format: "command", flavor: "plain", data: zpl }]);
}