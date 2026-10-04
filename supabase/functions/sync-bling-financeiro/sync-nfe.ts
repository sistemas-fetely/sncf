import type { BlingClient } from "../_shared/bling/bling-client.ts";
import {
  extrairFinNFeDoXml,
  extrairRefNFeDoXml,
  normalizarChaveNfe,
  alertarDevolucaoSemReferencia,
} from "../_shared/nf-referenciada.ts";
import { sleep, parseBlingDate, novoEstadoNfe, type EstadoNfe } from "../_shared/bling/nfe-item.ts";
export { sincronizarNfePorId, type EstadoNfe } from "../_shared/bling/nfe-item.ts";


export async function syncNfe( supabase: any, client: BlingClient, timeUp: () => boolean, cursor: { ultima_pagina: number; ultima_data_corte: string | null }, ) { let pagina = Math.max(cursor.ultima_pagina + 1, 1); let ultimoErro = "";
const limite90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const st = novoEstadoNfe(limite90d);

// ENTRADA-VIVE-NO-STAGE (29/08/2026): nfs_emitidas eh livro de SAIDA e continua assim.
// NFs de entrada emitidas pela propria Fetely (tipo=0) nao entravam em lugar nenhum —
// devolucao de venda ficava sem combustivel. Varredura isolada, ANTES do laco de saidas:
// entradas sao raras (2 em 90 dias) e baratas, entao pegam o orcamento primeiro. Se
// rodassem depois, morreriam de inanicao — o laco de saidas sai justamente quando o
// tempo acaba e timeUp() ja estaria true. Try/catch proprio: nada aqui pode derrubar
// o sync de saida que ja funciona. Teto de 3 paginas dentro de syncNfeEntradas.
let entradasEncontradas = 0, entradasGravadas = 0, entradasComReferencia = 0, entradasComErro = 0;
try {
  const r = await syncNfeEntradas(supabase, client, timeUp, limite90d);
  entradasEncontradas = r.encontradas;
  entradasGravadas = r.gravadas;
  entradasComReferencia = r.comReferencia;
  entradasComErro = r.comErro;
} catch (e) {
  entradasComErro++;
  console.error(`varredura de NFs de entrada falhou por completo: ${(e as Error).message}`);
}

while (!timeUp()) { let data: any; try { data = await client.get(`/nfe?limite=100&pagina=${pagina}`); } catch (e) { ultimoErro = `pagina ${pagina}: ${(e as Error).message}`; break; } const itemsRaw = data?.data || []; if (itemsRaw.length === 0) { pagina = 0; break; }
// Prioriza data_emissao mais recente para gastar o orcamento de revalidacao no que importa
const items = [...itemsRaw].sort((a: any, b: any) => String(b?.dataEmissao ?? "").localeCompare(String(a?.dataEmissao ?? "")));

for (const nf of items) {
  await processarNfItem(supabase, client, nf, st);
}

await supabase.from("integracoes_sync_cursor")
  .update({ ultima_pagina: pagina, total_processado: st.criados + st.atualizados, updated_at: new Date().toISOString() })
  .eq("sistema", "bling").eq("entidade", "nfe");

pagina++;
await sleep(300);


}

console.log(`sync nfe: revalidacoes de cancelamento=${st.revalidados}, canceladas detectadas=${st.canceladasDetectadas}, erros de detalhe=${st.errosDetalhe}`);

return { criados: st.criados, atualizados: st.atualizados, erros: st.erros, ultimoErro: ultimoErro || st.ultimoErro, proximaPagina: pagina, revalidados: st.revalidados, canceladasDetectadas: st.canceladasDetectadas, errosDetalhe: st.errosDetalhe,
  entradasEncontradas, entradasGravadas, entradasComReferencia, entradasComErro }; }

// O endpoint /nfe/{id} NAO expoe nota referenciada nem a finalidade no JSON: refNFe,
// finNFe e natOp existem somente no XML (verificado na NF real 000402: finNFe=4,
// natOp="Devolucao de Venda de Mercadoria"). A URL do campo `xml` ja vem assinada —
// GET puro, sem Authorization. Um GET so, regex simples, sem parser novo.
async function lerXmlNfe(
  xmlUrl: string,
  numero: string | null,
): Promise<{ refNFe: string | null; finNFe: number | null; natOp: string | null }> {
  const res = await fetch(xmlUrl);
  if (!res.ok) throw new Error(`XML ${res.status}`);
  const txt = await res.text();
  // REF-NFE-TOLERANTE: o regex antigo exigia a chave colada na tag e sem prefixo de
  // namespace — devolução com XML indentado perdia a refNFe em silêncio.
  const mNat = txt.match(/<(?:\w+:)?natOp\b[^>]*>([^<]*)<\/(?:\w+:)?natOp>/i);
  return {
    refNFe: normalizarChaveNfe(extrairRefNFeDoXml(txt), { numero, fonte: "bling_entrada" }),
    finNFe: extrairFinNFeDoXml(txt),
    natOp: mNat ? mNat[1].trim() : null,
  };
}

async function syncNfeEntradas(
  supabase: any,
  client: BlingClient,
  timeUp: () => boolean,
  dataInicial: string,
): Promise<{ encontradas: number; gravadas: number; comReferencia: number; comErro: number }> {
  let encontradas = 0, gravadas = 0, comReferencia = 0, comErro = 0;
  const dataFinal = new Date().toISOString().slice(0, 10);
  let pagina = 1;
  const PAGINAS_MAX = 3; // teto de seguranca: entradas nunca consomem o orcamento das saidas

  while (!timeUp() && pagina <= PAGINAS_MAX) {
    let lista: any;
    try {
      lista = await client.get(
        `/nfe?tipo=0&limite=100&pagina=${pagina}&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}`,
      );
    } catch (e) {
      comErro++;
      console.error(`entradas pagina ${pagina}: ${(e as Error).message}`);
      break;
    }
    const items = lista?.data || [];
    if (items.length === 0) break;

    for (const nf of items) {
      encontradas++;
      // FAIL-LOUD por nota: loga, conta e segue. Nunca aborta o lote.
      try {
        await sleep(120); // mesmo respiro de rate limit da varredura de saida
        const det = await client.get(`/nfe/${nf.id}`);
        const d = det?.data ?? {};

        const chave = d.chaveAcesso || nf.chaveAcesso || null;
        if (!chave) throw new Error("sem chaveAcesso");

        // FINALIDADE-VEM-DO-XML: o JSON do Bling traz naturezaOperacao como {id} sem
        // nome e a observacao nao contem "devolucao" — inferir por texto deixava
        // fin_nfe nulo justamente na nota de devolucao. O dado estruturado esta no
        // XML (finNFe / natOp / refNFe). Sem XML, a linha entra com os tres nulos.
        let refChave: string | null = null;
        let finNfe: number | null = null;
        let natOpXml: string | null = null;
        const numero = d.numero != null ? String(d.numero) : (nf.numero != null ? String(nf.numero) : null);
        if (d.xml) {
          await sleep(120);
          try {
            const x = await lerXmlNfe(String(d.xml), numero);
            refChave = x.refNFe;
            finNfe = x.finNFe;
            natOpXml = x.natOp;
          } catch (e) {
            // XML fora do ar / 404: conta erro, loga e grava a linha com os tres
            // campos nulos — nota sem XML ainda entra em nfs_stage.
            comErro++;
            console.error(`entrada ${nf?.id} XML: ${(e as Error).message}`);
          }
        }
        if (refChave) comReferencia++;

        // FAIL-LOUD: devolução sem nota referenciada é documento incompleto. Só loga;
        // a nota entra em nfs_stage de qualquer jeito.
        alertarDevolucaoSemReferencia({
          fin_nfe: finNfe,
          chave_referenciada: refChave,
          numero,
          serie: d.serie != null ? String(d.serie) : null,
          cnpj_emitente: String(d.contato?.numeroDocumento ?? "").replace(/\D/g, "") || null,
          fonte: "bling_entrada",
        });


        const natRaw = d.naturezaOperacao;
        const natJson = typeof natRaw === "string"
          ? natRaw
          : (natRaw?.nome ?? natRaw?.descricao ?? null);
        const natureza = natOpXml ?? natJson;

        const doc = String(d.contato?.numeroDocumento ?? nf.contato?.numeroDocumento ?? "").replace(/\D/g, "");

        const linha: any = {
          fonte: "bling_entrada",
          nf_numero: numero,
          nf_serie: d.serie != null ? String(d.serie) : null,
          nf_chave_acesso: chave,
          nf_data_emissao: parseBlingDate(d.dataEmissao ?? nf.dataEmissao),
          fornecedor_cnpj: doc || null,
          fornecedor_razao_social: d.contato?.nome ?? nf.contato?.nome ?? null,
          valor: d.valorNota != null ? Number(d.valorNota) : null,
          natureza_operacao: natureza,
          nf_referenciada_chave: refChave,
          fin_nfe: finNfe,
          itens: Array.isArray(d.itens) ? d.itens : null,
          descricao: `NF entrada ${numero ?? nf.id} · Bling`,
          tem_xml_obrigatorio: true,
        };

        // ON CONFLICT do PostgREST nao infere indice parcial (42P10). A RPC repete o
        // predicado de uniq_nfs_stage_chave_ativa e e idempotente por construcao.
        const { data: rpcOut, error: upErr } = await supabase
          .rpc("fn_nfs_stage_inserir_entrada", { p_linha: linha });
        if (upErr) throw new Error("fn_nfs_stage_inserir_entrada: " + upErr.message);
        if (rpcOut?.acao === "criada") gravadas++;
        // trg_stage_sugere_devolucao dispara sozinho para linhas com nf_referenciada_chave.
      } catch (e) {
        comErro++;
        console.error(`entrada ${nf?.id}: ${(e as Error).message}`);
      }
    }

    pagina++;
    await sleep(300);
  }

  console.log(`sync nfe entradas: encontradas=${encontradas}, gravadas=${gravadas}, com refNFe=${comReferencia}, erros=${comErro}`);
  return { encontradas, gravadas, comReferencia, comErro };
}
