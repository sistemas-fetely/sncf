// DEV-NF-AUTO (25/11/2026): transmissão automática da NF de devolução, mesmo modelo de transmitirTrs.
// Reserva durável em devolucao_nf_envio.envio_em ANTES do POST; preenchida = nunca reenviar.
// deno-lint-ignore-file no-explicit-any
import { BlingHttpError } from "../bling/bling-client.ts";
import { nfCancelada } from "./verificar-nf-dev.ts";

export const ERRO_DIVERGENCIA = "Natureza ou valor divergente — conferir com Eva";
export const AGUARDANDO_SEFAZ = "aguardando SEFAZ";

export type NfDevLida = { situacao?: number; numero?: string | number; chaveAcesso?: string | null; naturezaOperacao?: { id?: number }; valorNota?: number; mensagem?: string; motivo?: string; mensagemRejeicao?: string; situacaoCancelamento?: unknown; cancelamento?: unknown };

export const nfDevAutorizada = (nf: NfDevLida) => [5, 6].includes(Number(nf.situacao)) && !nfCancelada(nf);
export const nfDevImpedida = (nf: NfDevLida) => [2, 4, 9, 11].includes(Number(nf.situacao)) || nfCancelada(nf);

/** null = natureza e valor batem (tolerância 0,02). */
export function conferirNfDev(nf: NfDevLida, naturezaId: number | null, valorEsperado: number): string | null {
  if (!naturezaId || Number(nf.naturezaOperacao?.id) !== Number(naturezaId)) return ERRO_DIVERGENCIA;
  const v = Number(nf.valorNota);
  if (nf.valorNota == null || !Number.isFinite(v) || !Number.isFinite(valorEsperado) || Math.abs(v - valorEsperado) > 0.020000001) return ERRO_DIVERGENCIA;
  return null;
}

export type Decisao = "registrar_autorizada" | "erro_impedida" | "erro_divergencia" | "aguardar" | "reservar";
/** Decisão antes do POST, a partir da leitura da NF. */
export function decidirTransmissao(nf: NfDevLida, naturezaId: number | null, valorEsperado: number): Decisao {
  if (nfDevAutorizada(nf)) return "registrar_autorizada";
  if (nfDevImpedida(nf)) return "erro_impedida";
  if (conferirNfDev(nf, naturezaId, valorEsperado)) return "erro_divergencia";
  if (Number(nf.situacao) !== 1) return "aguardar";
  return "reservar";
}

type Deps = {
  bling: { get: (e: string) => Promise<any>; post: (e: string, b: unknown, o?: { retry?: boolean }) => Promise<any> };
  /** Grava envio_em=now só se ainda nulo. false = outra chamada já reservou/enviou. */
  reservar: () => Promise<boolean>;
  /** fn_devolucao_nf_registrar(status, bling_id, numero, erro, chave). */
  registrar: (status: "rascunho" | "autorizada", numero: string | null, erro: string | null, chave: string | null) => Promise<void>;
  /** Atualiza resultado/erro em devolucao_nf_envio (cria a linha se preciso, sem tocar envio_em). */
  gravarEnvio: (resultado: string, erro: string | null) => Promise<void>;
};
export type ResultadoTransmissao = { resultado: "autorizada" | "erro" | "aguardando" | "ja_reservado" | "pendente"; erro?: string; numero?: string | null };

const msg = (e: unknown) => e instanceof BlingHttpError ? (e.corpo || e.message) : e instanceof Error ? e.message : String(e);
const motivo = (nf: NfDevLida) => nf.mensagemRejeicao ?? nf.motivo ?? nf.mensagem ?? `NF impedida no Bling (situação ${nf.situacao}) — conferir com Eva`;

export async function transmitirNfDev(e: { blingNfeId: number; naturezaId: number | null; valorEsperado: number; numero: string | null }, deps: Deps): Promise<ResultadoTransmissao> {
  const id = e.blingNfeId;
  const nf: NfDevLida | undefined = (await deps.bling.get(`/nfe/${id}`))?.data;
  if (!nf) throw new Error("Bling não devolveu a NF para conferência antes da transmissão.");
  const numero = nf.numero == null ? e.numero : String(nf.numero);
  const autorizar = async (n: NfDevLida) => {
    const num = n.numero == null ? numero : String(n.numero);
    await deps.registrar("autorizada", num, null, n.chaveAcesso ?? null);
    await deps.gravarEnvio("autorizada", null);
    return { resultado: "autorizada" as const, numero: num };
  };
  const falhar = async (erro: string) => {
    await deps.gravarEnvio("erro", erro);
    await deps.registrar("rascunho", numero, erro, null);
    return { resultado: "erro" as const, erro, numero };
  };
  const d = decidirTransmissao(nf, e.naturezaId, e.valorEsperado);
  if (d === "registrar_autorizada") return autorizar(nf);
  if (d === "erro_impedida") return falhar(motivo(nf));
  if (d === "erro_divergencia") return falhar(ERRO_DIVERGENCIA);
  if (d === "aguardar") return { resultado: "pendente", numero };
  if (!await deps.reservar()) return { resultado: "ja_reservado", numero };
  try {
    await deps.bling.post(`/nfe/${id}/enviar`, {}, { retry: false });
  } catch (erro) {
    const atual: NfDevLida | undefined = await deps.bling.get(`/nfe/${id}`).then((r) => r?.data).catch(() => undefined);
    if (atual && nfDevAutorizada(atual)) return autorizar(atual);
    return falhar(`Falha na transmissão (não será reenviada): ${msg(erro)}`);
  }
  try {
    const atual: NfDevLida | undefined = (await deps.bling.get(`/nfe/${id}`))?.data;
    if (atual && nfDevAutorizada(atual)) return autorizar(atual);
    if (atual && nfDevImpedida(atual)) return falhar(motivo(atual));
  } catch (erro) { console.warn(`[transmitir-nf-dev] releitura ${id}: ${msg(erro)}`); }
  await deps.gravarEnvio(AGUARDANDO_SEFAZ, null);
  return { resultado: "aguardando", numero };
}
