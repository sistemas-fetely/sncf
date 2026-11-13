import { BlingHttpError, type BlingClient } from "../_shared/bling/bling-client.ts";
import type { Registro } from "./gerar.ts";

export type NfLida = { situacao?: number; numero?: string; naturezaOperacao?: { id?: number }; valorNota?: number; mensagem?: string; motivo?: string; mensagemRejeicao?: string; situacaoCancelamento?: unknown; cancelamento?: unknown };
type Entrada = Registro & { automatico: boolean; naturezaId: number; valorEsperado: number };
type Deps = {
  bling: Pick<BlingClient, "get" | "post">;
  reservar: (marcador: string) => Promise<boolean>;
  registrar: (r: Registro) => Promise<void>;
  evento: (descricao: string) => Promise<void>;
};
export const marcadorEnvio = (id: number) => `[envio NF ${id} iniciado]`;
export const valorConferido = (atual: unknown, esperado: number) => atual != null && Number.isFinite(Number(atual)) && Number.isFinite(esperado) && Math.abs(Number(atual) - esperado) <= 0.020000001;
export const autorizada = (nf: NfLida) => [5, 6].includes(Number(nf.situacao)) && !nf.cancelamento && !nf.situacaoCancelamento;
const mensagem = (e: unknown) => e instanceof Error ? e.message : String(e);

/** A reserva durável é gravada antes do POST. Falha/timeout nunca libera reenvio automático. */
export async function transmitirTrs(e: Entrada, deps: Deps) {
  if (!e.automatico || !e.bling_nfe_id) return { ok: true, ...e, idempotente: true };
  const id = e.bling_nfe_id;
  const marca = marcadorEnvio(id);
  const nf: NfLida | undefined = (await deps.bling.get(`/nfe/${id}`))?.data;
  if (!nf) throw new Error("Bling não devolveu a NF para conferência antes da transmissão.");
  const base: Registro = { status: e.status, bling_nfe_id: id, numero: nf.numero == null ? e.numero : String(nf.numero), natureza_conferida: e.natureza_conferida, erro: e.erro };
  const salvar = async (status: string, erro: string | null, descricao: string) => {
    const registro = { ...base, status, erro };
    await deps.registrar(registro);
    await deps.evento(descricao);
    return { ok: status !== "erro", ...registro };
  };
  if (autorizada(nf)) return salvar("transmitida", null, `NF direta ${base.numero ?? id} já autorizada no Bling; nenhum envio repetido (id ${id}).`);
  if ([2, 4, 9, 11].includes(Number(nf.situacao))) return salvar("erro", `${e.erro?.includes(marca) ? `${marca} · ` : ""}${nf.mensagemRejeicao ?? nf.motivo ?? nf.mensagem ?? `NF impedida no Bling (situação ${nf.situacao}); conferir com Eva.`}`, `NF direta ${id}: rejeitada/impedida; conferir com Eva.`);
  if (e.erro?.includes(marca)) return { ok: e.status !== "erro", ...base, idempotente: true, alertas: ["Envio já iniciado; aguardando autorização ou conferência da Eva. Não será reenviado automaticamente."] };
  if (!e.natureza_conferida || Number(nf.naturezaOperacao?.id) !== e.naturezaId || !valorConferido(nf.valorNota, e.valorEsperado)) {
    const alerta = "Natureza não conferida ou valor divergente; transmissão automática bloqueada — conferir com Eva.";
    const r = await salvar("rascunho", alerta, `NF direta ${id}: ${alerta}`);
    return { ...r, alertas: [alerta] };
  }
  if (Number(nf.situacao) !== 1) return { ok: true, ...base, alertas: [`NF em situação ${nf.situacao}; envio automático não permitido.`] };
  if (!await deps.reservar(marca)) return { ok: true, ...base, idempotente: true, alertas: ["Outra chamada já reservou o envio."] };
  try {
    await deps.bling.post(`/nfe/${id}/enviar`, {}, { retry: false });
  } catch (erro) {
    // Uma recusa pode ser corrida com envio manual: consultar antes de classificar como erro.
    const atual: NfLida | undefined = await deps.bling.get(`/nfe/${id}`).then(r => r?.data).catch(() => undefined);
    if (atual && autorizada(atual)) return salvar("transmitida", null, `NF direta ${id} autorizada; confirmação após resposta do envio.`);
    const detalhe = erro instanceof BlingHttpError ? erro.corpo || erro.message : mensagem(erro);
    return salvar("erro", `${marca} · ${detalhe}`, `Falha/rejeição na transmissão da NF direta ${id}: ${detalhe}`);
  }
  try {
    const atual: NfLida | undefined = (await deps.bling.get(`/nfe/${id}`))?.data;
    if (!atual) throw new Error("NF enviada, mas leitura de confirmação não retornou dados.");
    if (autorizada(atual)) return salvar("transmitida", null, `NF direta ${id} autorizada após transmissão automática.`);
    if ([2, 4, 9, 11].includes(Number(atual.situacao))) {
      const erro = atual.mensagemRejeicao ?? atual.motivo ?? atual.mensagem ?? `Rejeição/impedimento SEFAZ (situação ${atual.situacao}); conferir com Eva.`;
      return salvar("erro", `${marca} · ${erro}`, `NF direta ${id}: ${erro}`);
    }
    return salvar("rascunho", `${marca} · Aguardando retorno da SEFAZ; não reenviar.`, `NF direta ${id} enviada uma vez; aguardando autorização da SEFAZ.`);
  } catch (erro) {
    return salvar("erro", `${marca} · ${mensagem(erro)}`, `NF direta ${id}: falha ao conferir retorno; envio não será repetido. ${mensagem(erro)}`);
  }
}