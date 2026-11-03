// Regra ÚNICA de verificação da NF de devolução/nota de crédito no Bling (03/11/2026).
// Usada pelo botão "Verificar autorização" (devolucao-gerar-rascunho-nf) e pela rotina
// automática (devolucao-nf-verifica). 5/6 sem cancelamento → autorizada; 2/cancelada/404 → erro;
// demais situações → não grava nada.
// deno-lint-ignore-file no-explicit-any
import { BlingHttpError } from "../bling/bling-client.ts";

/** Mesma regra de detectarCancelamento do sync-nfe. */
export function nfCancelada(d: any): boolean {
  const sc = d?.situacaoCancelamento;
  const scVal = sc != null && typeof sc === "object" ? sc.valor : sc;
  let porSc = false;
  if (scVal != null && scVal !== "" && scVal !== false) {
    const n = Number(scVal);
    porSc = Number.isFinite(n) ? n > 0 : !/^(nao|não|n|0|false|sem)/i.test(String(scVal).trim());
  }
  const c = d?.cancelamento;
  const porC = c != null && c !== "" && c !== false && (typeof c !== "object" || Object.keys(c).length > 0);
  return porSc || porC;
}

export type ResultadoVerificacao =
  | { resultado: "autorizada"; numero: string | null; chave: string | null; situacao: number }
  | { resultado: "cancelada"; situacao: number | null }
  | { resultado: "pendente"; situacao: number };

/** Consulta o Bling e grava via fn_devolucao_nf_registrar. Lança erro com a mensagem real. */
export async function verificarNfDevolucao(
  db: any,
  bling: { get: (e: string) => Promise<any> },
  devId: string,
): Promise<ResultadoVerificacao> {
  const { data: dev, error } = await db.from("devolucao").select("nf_dev_bling_id,nf_dev_numero,nf_dev_status").eq("id", devId).single();
  if (error) throw error;
  if (!dev?.nf_dev_bling_id) throw new Error("Devolução sem rascunho de NF no Bling.");
  const registrar = async (status: string, blingId: number | null, numero: string | null, erro: string | null, chave: string | null) => {
    const { error: e } = await db.rpc("fn_devolucao_nf_registrar", { p_devolucao_id: devId, p_status: status, p_bling_id: blingId, p_numero: numero, p_erro: erro, p_chave: chave });
    if (e) throw e;
  };
  const blingId = Number(dev.nf_dev_bling_id);
  let nf: any = null; let excluida = false;
  try { nf = (await bling.get(`/nfe/${blingId}`))?.data; }
  catch (ge) { if (ge instanceof BlingHttpError && ge.status === 404) excluida = true; else throw ge; }
  // Na API v3 do Bling, situação 2 da NF-e = "Cancelada".
  if (excluida || (nf && (nfCancelada(nf) || Number(nf.situacao) === 2))) {
    await registrar("erro", null, null, `NF ${dev.nf_dev_numero ?? "?"} (Bling ${blingId}) cancelada/excluída no Bling — gere de novo.`, null);
    return { resultado: "cancelada", situacao: nf ? Number(nf.situacao) : null };
  }
  if (!nf) throw new Error("Bling não devolveu a NF.");
  const situacao = Number(nf.situacao);
  if (situacao === 5 || situacao === 6) {
    const numero = String(nf.numero ?? dev.nf_dev_numero ?? "") || null;
    const chave = nf.chaveAcesso ?? null;
    await registrar("autorizada", blingId, numero, null, chave);
    return { resultado: "autorizada", numero, chave, situacao };
  }
  return { resultado: "pendente", situacao };
}
