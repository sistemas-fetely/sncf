import type { BlingClient } from "../_shared/bling/bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function resolveParceiroId(supabase: any, contato: any): Promise<string | null> { if (!contato?.id) return null; const blingId = String(contato.id); const { data: found } = await supabase .from("parceiros_comerciais").select("id").eq("bling_id", blingId).maybeSingle(); if (found) return found.id; if (!contato.nome) return null; const doc = (contato.numeroDocumento || "").replace(/\D/g, ""); const { data: novo, error: insErr } = await supabase.from("parceiros_comerciais").insert({ razao_social: contato.nome, tipo: "pj", tipo_pessoa: doc.length === 11 ? "PF" : "PJ", tipos: ["cliente"], origem: "bling", bling_id: blingId, cpf: doc.length === 11 ? doc : null, cnpj: doc.length === 14 ? doc : null, email: contato.email || null, telefone: contato.telefone || null, }).select("id").maybeSingle(); if (insErr) { console.error(`resolveParceiroId INSERT failed [bling_id=${blingId}]: ${insErr.message}`); return null; } return novo?.id ?? null; }

// FONTE UNICA de resolucao: a regra vive no banco (fn_resolver_pedido_por_ref_bling).
// numeroPedidoLoja pode conter o codigo canonico da remessa gravado em pedido_remessa.codigo_bling.
// Remessas novas nascem no formato {id_externo}-R{NN} (ex.: PED-2121-R01); o formato /NN (ex.: PED-2121/01)
// so existe no legado ja emitido. A RPC resolve pela ponte pedido_remessa, com fallback exato e fallback
// sem sufixo, e ignora pedido cancelado.
async function resolvePedidoId(supabase: any, ref: any): Promise<string | null> {
  if (ref === null || ref === undefined || ref === "") return null;
  const r = String(ref).trim();
  if (!r) return null;
  const { data, error } = await supabase.rpc("fn_resolver_pedido_por_ref_bling", { p_ref: r });
  if (error) {
    console.error(`resolvePedidoId RPC falhou [ref=${r}]: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

function parseBlingDate(val: unknown): string | null { if (!val) return null; const s = String(val).split(/[T ]/)[0]; return s.startsWith("0000") ? null : s; }

const SITUACAO_MAP: Record<number, string> = { 1: "pendente", 2: "cancelada", 3: "pendente", 4: "rejeitada", 5: "autorizada", 6: "autorizada", 7: "registrada", 8: "pendente", 9: "denegada", 10: "pendente", 11: "bloqueada", };

// Deteccao de cancelamento: Bling devolve situacao=5 (autorizada) na listagem mesmo
// para nota cancelada. A verdade vem no detalhe, em situacaoCancelamento (numero,
// string ou objeto com .valor) e/ou cancelamento (objeto com dataCancelamento etc).
function detectarCancelamento(d: any): { cancelada: boolean; raw: any } {
  const sc = d?.situacaoCancelamento;
  const scVal = sc != null && typeof sc === "object" ? sc.valor : sc;
  let porSituacaoCancelamento = false;
  if (scVal != null && scVal !== "" && scVal !== false) {
    const n = Number(scVal);
    if (Number.isFinite(n)) porSituacaoCancelamento = n > 0;
    else porSituacaoCancelamento = !/^(nao|não|n|0|false|sem)/i.test(String(scVal).trim());
  }
  const c = d?.cancelamento;
  const porCancelamento = c != null && c !== "" && c !== false &&
    (typeof c !== "object" || Object.keys(c).length > 0);
  return {
    cancelada: porSituacaoCancelamento || porCancelamento,
    raw: { situacaoCancelamento: sc ?? null, cancelamento: c ?? null },
  };
}

const REVALIDACAO_MAX = 40; // orcamento de 90s da funcao — teto de reconsultas por execucao

export async function syncNfe( supabase: any, client: BlingClient, timeUp: () => boolean, cursor: { ultima_pagina: number; ultima_data_corte: string | null }, ) { let criados = 0, atualizados = 0, erros = 0; let pagina = Math.max(cursor.ultima_pagina + 1, 1); let ultimoErro = "";
let revalidados = 0, errosDetalhe = 0, canceladasDetectadas = 0;
const limite90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

  try {
    const blingId = String(nf.id);
    const parceiro_id = await resolveParceiroId(supabase, nf.contato);
    let pedido_venda_id: string | null = null;
    const sitNum = typeof nf.situacao === "object" ? nf.situacao?.valor : nf.situacao;

    const { data: existing } = await supabase
      .from("nfs_emitidas")
      .select("id, numero, situacao, data_emissao, valor_nota, pedido_venda_id, valor_frete, transportadora_nome, transportadora_cnpj, itens_json, numero_pedido_loja, bling_pedido_venda_numero, bling_pedido_venda_id, transporte_raw, serie, pdf_url, xml_url")
      .eq("bling_id", blingId)
      .maybeSingle();

    const semValor = !existing || !existing.valor_nota || Number(existing.valor_nota) === 0;
    const semFrete = !existing?.valor_frete || Number(existing.valor_frete) === 0;
    const semPedido = !existing?.pedido_venda_id; const semTransporte = !existing?.transporte_raw;
    const semSerie = !existing?.serie;
    const semArquivo = !existing?.pdf_url || !existing?.xml_url;

    // Nota completa e autorizada dos ultimos 90 dias pode ter sido cancelada DEPOIS
    // do sync — sem reconsulta o cancelamento fica invisivel para sempre.
    const revalidarCancelamento = !!existing && existing.situacao === "autorizada" &&
      !!existing.data_emissao && String(existing.data_emissao).slice(0, 10) >= limite90d &&
      revalidados < REVALIDACAO_MAX;

    // Busca detalhe apenas quando falta valor, frete, pedido, transporte, série
    // ou arquivo (pdf_url/xml_url) — evita rate limit do Bling.
    // Pedido linkage tenta junto quando já estamos no detalhe, mas não aciona sozinho.
    let situacaoDetalhe: string | null = null;
    let numeroPedidoLojaRaw: string | null = null;
    let pedidoVendaNumeroRaw: string | null = null;
    let pedidoVendaBlingIdRaw: string | null = null;
    let serieDetalhe: string | null = null;

    if (semValor || semFrete || semPedido || semTransporte || semSerie || semArquivo || revalidarCancelamento) {
      if (revalidarCancelamento) revalidados++;

      try {
        await sleep(120); // respeita rate limit do Bling (~3 req/s)
        const det = await client.get(`/nfe/${nf.id}`);
        const d = det?.data;
        if (d) {
          // Bling retorna situacao=5 (autorizada) mesmo após cancelamento.
          // O cancelamento real está em d.situacaoCancelamento ou d.cancelamento.
          const detSitNum = typeof d.situacao === "object" ? d.situacao?.valor : d.situacao;
          if (detSitNum != null) {
            situacaoDetalhe = SITUACAO_MAP[Number(detSitNum)] || null;
          }
          // Cancelamento tem PRECEDENCIA sobre o mapa de situacao.
          const canc = detectarCancelamento(d);
          if (canc.cancelada || SITUACAO_MAP[Number(detSitNum)] === "cancelada") {
            situacaoDetalhe = "cancelada";
            nf._cancelamentoRaw = canc.raw;
          }

          numeroPedidoLojaRaw = d.numeroPedidoLoja != null ? String(d.numeroPedidoLoja) : null;
          pedidoVendaNumeroRaw = d.pedidoVenda?.numero != null ? String(d.pedidoVenda.numero) : null;
          pedidoVendaBlingIdRaw = d.pedidoVenda?.id != null ? String(d.pedidoVenda.id) : null;
          serieDetalhe = d.serie != null ? String(d.serie) : null;



          // Valor
          if (semValor) {
            nf._valorResolvido = Number(
              d.valorNota ?? d.totalProdutos ?? d.total?.produtos ??
              d.total?.nota ?? d.totalNota ?? d.valor ?? 0
            ) || 0;
          }

          // Frete e transportadora
          nf._valorFrete = d.valorFrete != null ? Number(d.valorFrete) : null;
          
          nf._transportadoraNome = d.transporte?.transportador?.nome ?? d.transporte?.transportadora?.nome ?? d.transporte?.nome ?? null;
          nf._transportadoraCnpj = d.transporte?.transportador?.numeroDocumento ?? null; nf._transporteRaw = d.transporte ?? null;

          // tipo_venda: J = B2B, F = B2C
          const tipoPessoa = d.contato?.tipoPessoa ?? nf.contato?.tipoPessoa ?? null;
          nf._tipoVenda = tipoPessoa === "J" ? "B2B" : tipoPessoa === "F" ? "B2C" : null;

          nf._itens = Array.isArray(d.itens) && d.itens.length > 0 ? d.itens.map((it: any) => ({ codigo: it.codigo ?? null, descricao: it.descricao ?? null, quantidade: it.quantidade ?? 0, valor: it.valor ?? 0, valor_total: it.valorTotal ?? 0, unidade: it.unidade ?? null, cfop: it.cfop ?? null, ncm: it.classificacaoFiscal ?? null, peso_bruto: it.pesoBruto ?? null, icms_valor: it.impostos?.icms?.valor ?? null, icms_aliquota: it.impostos?.icms?.aliquota ?? null, })) : null;

          // XML/PDF
          if (d.xml)      nf.xml     = d.xml;
          if (d.linkPDF)  nf.linkPDF = d.linkPDF;
          if (d.linkDanfe && !nf.linkPDF) nf.linkPDF = d.linkDanfe;

          // DUPLICATAS: payload cru do Bling. Array vazio significa "NF sem parcela"
          // (à vista/bonificação), mas duplicatas_sync_em preenchido prova que o
          // detalhe foi lido. NULL em ambos significa "nunca passou por este sync".
          nf._duplicatas = Array.isArray(d.parcelas) ? d.parcelas : [];
          nf._duplicatasSyncEm = new Date().toISOString();


          // Pedido linkage (aproveita enquanto já temos o detalhe)
          if (semPedido) {
            pedido_venda_id = await resolvePedidoId(supabase, d.numeroPedidoLoja);
            if (!pedido_venda_id && d.pedidoVenda?.numero) {
              pedido_venda_id = await resolvePedidoId(supabase, d.pedidoVenda.numero);
            }
            if (!pedido_venda_id && d.pedidoVenda?.id) {
              const { data: rm } = await supabase
                .from("pedido_remessa").select("pedido_id")
                .eq("bling_pedido_id", String(d.pedidoVenda.id))
                .neq("status", "cancelada").maybeSingle();
              pedido_venda_id = rm?.pedido_id ?? null;
            }

            // Fallback 4: pedidoVenda.id → pedidos.bling_id_destino
            // Cobre NFs nascidas diretamente do pedido no Bling (fluxo a partir de jun/2026)
            if (!pedido_venda_id && d.pedidoVenda?.id) {
              const { data: pp } = await supabase
                .from("pedidos")
                .select("id")
                .eq("bling_id_destino", String(d.pedidoVenda.id))
                .maybeSingle();
              pedido_venda_id = pp?.id ?? null;
            }
          }
        }
      } catch (e) {
        // FAIL-LOUD por NF: loga e conta, mas nao aborta o sync inteiro
        errosDetalhe++;
        console.error(`detalhe /nfe/${nf.id} falhou: ${(e as Error).message}`);
      }

    }

    // Vínculo resolvido AGORA nesta execução (antes de preservar o existente)
    const vinculoNovo = !!pedido_venda_id;

    // Preserva pedido_venda_id já gravado no banco
    if (!pedido_venda_id && existing?.pedido_venda_id) {
      pedido_venda_id = existing.pedido_venda_id;
    }

    // Valor: nunca sobrescreve com zero se já existe valor no banco (evita regressão)
    const valorNota = (nf._valorResolvido != null && nf._valorResolvido > 0)
      ? nf._valorResolvido
      : (Number(existing?.valor_nota) > 0 ? Number(existing.valor_nota) : 0);

    // Frete: só atualiza se veio algo do detalhe
    const valorFrete = (nf._valorFrete != null && nf._valorFrete > 0)
      ? nf._valorFrete
      : (Number(existing?.valor_frete) > 0 ? Number(existing.valor_frete) : null);

    const transportadoraNome = nf._transportadoraNome
      ?? existing?.transportadora_nome
      ?? null;

    const registro: any = {
      bling_id:            blingId,
      numero:              nf.numero != null ? String(nf.numero) : null,
      serie:               serieDetalhe ?? (nf.serie != null ? String(nf.serie) : null) ?? existing?.serie ?? null,
      chave_acesso:        nf.chaveAcesso || null,
      tipo:                nf.tipo === 0 ? "entrada" : "saida",
      situacao:            situacaoDetalhe ?? SITUACAO_MAP[Number(sitNum)] ?? String(sitNum || ""),
      data_emissao:        parseBlingDate(nf.dataEmissao),
      data_saida:          parseBlingDate(nf.dataOperacao),
      valor_nota:          valorNota,
      valor_frete:         valorFrete,
      transportadora_nome: transportadoraNome,
      transportadora_cnpj: nf._transportadoraCnpj ?? existing?.transportadora_cnpj ?? null, transporte_raw: nf._transporteRaw ?? existing?.transporte_raw ?? null,
      tipo_venda: nf._tipoVenda ?? existing?.tipo_venda ?? null,
      itens_json: nf._itens ?? existing?.itens_json ?? null,
      parceiro_id,
      xml_url:             nf.xml     ?? existing?.xml_url ?? null,
      pdf_url:             nf.linkPDF ?? existing?.pdf_url ?? null,
      // RAW-NÃO-EMAGRECE: o objeto da listagem é mais pobre que o do detalhe.
      // Só sobrescreve o raw quando o detalhe foi realmente buscado nesta execução.
      raw:                 (nf._itens ? nf : (existing?.raw ?? nf)),

      origem:              "bling",
      updated_at:          new Date().toISOString(),
      numero_pedido_loja:        numeroPedidoLojaRaw ?? existing?.numero_pedido_loja ?? null,
      bling_pedido_venda_numero: pedidoVendaNumeroRaw ?? existing?.bling_pedido_venda_numero ?? null,
      bling_pedido_venda_id:     pedidoVendaBlingIdRaw ?? existing?.bling_pedido_venda_id ?? null,
    };
    if (pedido_venda_id) registro.pedido_venda_id = pedido_venda_id;
    if (vinculoNovo) {
      registro.vinculo_origem = 'bling';
      registro.vinculo_em = new Date().toISOString();
      try {
        const { data: ped } = await supabase
          .from("pedidos").select("id_externo").eq("id", pedido_venda_id).maybeSingle();
        if (ped?.id_externo) registro.vinculo_pedido_ref = String(ped.id_externo);
      } catch (_) { /* ref é opcional — não quebra o sync */ }
    }

    if (existing) {
      const { error: updErr } = await supabase.from("nfs_emitidas").update(registro).eq("id", existing.id);
      if (updErr) throw new Error("UPDATE nfs_emitidas: " + updErr.message);
      atualizados++;

      // NF virou cancelada. O estorno automatico do estoque, titulos e estagio do pedido
      // agora eh feito pelo trigger trg_nf_cancelada_propaga (via fn_nf_cancelada_propagar).
      // Esse trigger tem uma guarda: se houver titulo PAGO ou adiantamento com saldo, ele NAO
      // propaga — grava evento e devolve bloqueado. Portanto o achado aqui soh nasce quando
      // existem movimentos originais de baixa E nao existe a contrapartida de estorno.
      if (existing.situacao === "autorizada" && registro.situacao === "cancelada") {
        canceladasDetectadas++;
        const numeroNf = registro.numero ?? existing.numero ?? null;
        try {
          const { data: movsOriginais } = await supabase
            .from("movimentacao_estoque")
            .select("id, quantidade")
            .eq("nf_saida_id", existing.id)
            .in("origem", ["nf_emissao", "transferencia_cd"]);

          const { data: estornoExistente } = await supabase
            .from("movimentacao_estoque")
            .select("id")
            .eq("nf_saida_id", existing.id)
            .eq("origem", "estorno_nf_cancelada")
            .limit(1);

          if (estornoExistente && estornoExistente.length > 0) {
            console.log(`cancelamento NF ${numeroNf ?? existing.id}: propagacao automatica ja estornou o estoque.`);
          } else if (movsOriginais && movsOriginais.length > 0) {
            const agora = new Date().toISOString();
            const soma = movsOriginais.reduce((acc: number, m: any) => acc + Number(m.quantidade || 0), 0);
            const { error: achErr } = await supabase.from("auditoria_achado").insert({
              regra_slug: "nf-cancelada-com-baixa-de-estoque",
              chave: String(numeroNf ?? existing.id),
              entidade: "nf",
              valor: -soma,
              detalhe: `NF ${numeroNf ?? existing.id} cancelada mas a propagacao automatica NAO estornou o estoque (${movsOriginais.length} movimentos originais, nenhum estorno). Provavel bloqueio por dinheiro dentro — ver pedido_eventos.`,
              primeira_vez_em: agora,
              ultima_vez_em: agora,
              vezes_visto: 1,
              situacao: "aberto",
            });
            if (achErr) console.error(`achado nf-cancelada-com-baixa-de-estoque [nf=${numeroNf ?? existing.id}]: ${achErr.message}`);
          }
        } catch (e) {
          console.error(`checagem de estoque da NF cancelada ${numeroNf ?? existing.id} falhou: ${(e as Error).message}`);
        }
      }
    } else {
      const { error: insErr } = await supabase.from("nfs_emitidas").insert(registro);
      if (insErr) throw new Error("INSERT nfs_emitidas [bling_id=" + blingId + "]: " + insErr.message);
      criados++;
    }

  } catch (e) {
    erros++;
    ultimoErro = `item ${nf?.id}: ${(e as Error).message}`;
  }
}

await supabase.from("integracoes_sync_cursor")
  .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
  .eq("sistema", "bling").eq("entidade", "nfe");

pagina++;
await sleep(300);


}

console.log(`sync nfe: revalidacoes de cancelamento=${revalidados}, canceladas detectadas=${canceladasDetectadas}, erros de detalhe=${errosDetalhe}`);

return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina, revalidados, canceladasDetectadas, errosDetalhe,
  entradasEncontradas, entradasGravadas, entradasComReferencia, entradasComErro }; }

// O endpoint /nfe/{id} NAO expoe nota referenciada nem a finalidade no JSON: refNFe,
// finNFe e natOp existem somente no XML (verificado na NF real 000402: finNFe=4,
// natOp="Devolucao de Venda de Mercadoria"). A URL do campo `xml` ja vem assinada —
// GET puro, sem Authorization. Um GET so, regex simples, sem parser novo.
async function lerXmlNfe(xmlUrl: string): Promise<{ refNFe: string | null; finNFe: number | null; natOp: string | null }> {
  const res = await fetch(xmlUrl);
  if (!res.ok) throw new Error(`XML ${res.status}`);
  const txt = await res.text();
  const mRef = txt.match(/<refNFe>(\d{44})<\/refNFe>/);
  const mFin = txt.match(/<finNFe>(\d)<\/finNFe>/);
  const mNat = txt.match(/<natOp>([^<]*)<\/natOp>/);
  return {
    refNFe: mRef ? mRef[1] : null,
    finNFe: mFin ? Number(mFin[1]) : null,
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
        if (d.xml) {
          await sleep(120);
          try {
            const x = await lerXmlNfe(String(d.xml));
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

        const natRaw = d.naturezaOperacao;
        const natJson = typeof natRaw === "string"
          ? natRaw
          : (natRaw?.nome ?? natRaw?.descricao ?? null);
        const natureza = natOpXml ?? natJson;

        const doc = String(d.contato?.numeroDocumento ?? nf.contato?.numeroDocumento ?? "").replace(/\D/g, "");
        const numero = d.numero != null ? String(d.numero) : (nf.numero != null ? String(nf.numero) : null);

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
