// Planilha "Pagamentos das Notas Fiscais de Serviços Tomados" (layout do escritório, 15 colunas).
// Fonte única para a tela do pacote (gerar-pacote-contador-v2 {retencoes:true}) e para o ZIP.
// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx@0.18.5";
import { parseNfseXml } from "../nfse-xml.ts";
import { retencoesDoXml, type RetencoesNfse } from "../nfse-retencoes.ts";
import { obsPagaNoMes, recuarMeses, type GrupoRetencao } from "./retencoesGrupos.ts";

export const BUCKET = "contabil";
export type Situacao = "vinculado" | "candidato" | "multiplos" | "nao_localizado";

async function todas(q: any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function baixarTexto(admin: any, path: string): Promise<string> {
  let ultimo = "";
  for (let t = 0; t < 3; t++) {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (!error && data) return await data.text();
    ultimo = error?.message ?? "vazio";
    await new Promise((r) => setTimeout(r, 400 * (t + 1)));
  }
  throw new Error(ultimo);
}

const SEL_NFS = "id,nf_numero,nf_data_emissao,fornecedor_razao_social,fornecedor_cnpj,valor,xml_storage_path,resumo_pdf_storage_path,status";
const SEL_VINC = "nfs_stage_id,movimentacao_id,confirmado_em,confirmado_por,movimentacoes_bancarias!inner(data_transacao,valor,descricao)";

async function lerXmls(admin: any, nfs: any[], grupo: GrupoRetencao, erros: any[]) {
  const lidas: { n: any; r: RetencoesNfse; prestador: string | null }[] = [];
  for (let i = 0; i < nfs.length; i += 8) {
    await Promise.all(nfs.slice(i, i + 8).map(async (n: any) => {
      const g = grupo === "emitida" ? "" : ` (${grupo === "paga_no_mes" ? "paga neste mês" : "em aberto"})`;
      if (!n.xml_storage_path) { erros.push({ nfs_stage_id: n.id, numero: n.nf_numero, grupo, erro: `XML não guardado${g}` }); return; }
      try {
        const xml = await baixarTexto(admin, n.xml_storage_path);
        lidas.push({ n, r: retencoesDoXml(xml), prestador: parseNfseXml(xml).prestador_razao });
      } catch (e) { erros.push({ nfs_stage_id: n.id, numero: n.nf_numero, grupo, erro: `XML não lido${g}: ${e instanceof Error ? e.message : String(e)}` }); }
    }));
  }
  return lidas.filter((l) => l.r.tem_retencao)
    .sort((a, b) => String(a.n.nf_data_emissao).localeCompare(String(b.n.nf_data_emissao)) || String(a.n.nf_numero).localeCompare(String(b.n.nf_numero)));
}

export async function montarRetencoes(admin: any, userDb: any, ini: string, fim: string) {
  const naoDesc = (q: any) => q.eq("tipo_documento", "nfse").not("status", "in", "(descartada,duplicada)");
  const erros: { nfs_stage_id: string; numero: string | null; grupo: GrupoRetencao; erro: string }[] = [];
  // (a) emitidas em M
  const nfs = await todas(naoDesc(admin.from("nfs_stage").select(SEL_NFS)).gte("nf_data_emissao", ini).lte("nf_data_emissao", fim).order("nf_data_emissao"));
  const comA = await lerXmls(admin, nfs, "emitida", erros);
  const lidasA = nfs.length - erros.length;
  // (b) emitidas antes de M, pagamento confirmado com movimentação em M
  const pagosNoMes = await todas(admin.from("contabil_nfse_pagamento").select(SEL_VINC).eq("vigente", true)
    .gte("movimentacoes_bancarias.data_transacao", ini).lte("movimentacoes_bancarias.data_transacao", fim));
  const idsB = [...new Set(pagosNoMes.map((v: any) => v.nfs_stage_id))];
  const nfsB = idsB.length ? await todas(naoDesc(admin.from("nfs_stage").select(SEL_NFS)).in("id", idsB).lt("nf_data_emissao", ini)) : [];
  const comB = await lerXmls(admin, nfsB, "paga_no_mes", erros);
  // (c) emitidas nos 12 meses antes de M, sem pagamento confirmado
  const antes = await todas(naoDesc(admin.from("nfs_stage").select(SEL_NFS)).gte("nf_data_emissao", recuarMeses(ini, 12)).lt("nf_data_emissao", ini).order("nf_data_emissao"));
  const vincAntes = new Set<string>();
  for (let i = 0; i < antes.length; i += 300) {
    const ids = antes.slice(i, i + 300).map((n: any) => n.id);
    const { data, error } = await admin.from("contabil_nfse_pagamento").select("nfs_stage_id").eq("vigente", true).in("nfs_stage_id", ids);
    if (error) throw error;
    for (const v of data ?? []) vincAntes.add(v.nfs_stage_id);
  }
  const comC = await lerXmls(admin, antes.filter((n: any) => !vincAntes.has(n.id)), "em_aberto", erros);

  const idsA = comA.map((l) => l.n.id);
  const vincA = idsA.length ? await todas(admin.from("contabil_nfse_pagamento").select(SEL_VINC).in("nfs_stage_id", idsA).eq("vigente", true)) : [];
  const pag = (v: any) => ({ movimentacao_id: v.movimentacao_id, data: v.movimentacoes_bancarias?.data_transacao, valor: Math.abs(Number(v.movimentacoes_bancarias?.valor ?? 0)), descricao: v.movimentacoes_bancarias?.descricao, confirmado_em: v.confirmado_em });
  const montar = async ({ n, r, prestador }: { n: any; r: RetencoesNfse; prestador: string | null }, grupo: GrupoRetencao, v: any) => {
    let situacao: Situacao; let pagamento: any = null; let candidatos: any[] = [];
    if (v) { situacao = "vinculado"; pagamento = pag(v); }
    else {
      const { data, error } = await userDb.rpc("fn_contabil_nfse_pagamento_candidatos", { p_nfs_stage_id: n.id, p_valor_liquido: r.liquido });
      if (error) throw new Error(`Candidatos de pagamento da NFS-e ${n.nf_numero}: ${error.message}`);
      candidatos = data ?? [];
      const exatos = candidatos.filter((c: any) => c.exato);
      const mesmo = exatos.filter((c: any) => c.mesmo_favorecido);
      const escolhidos = mesmo.length ? mesmo : exatos;
      situacao = escolhidos.length === 1 ? "candidato" : escolhidos.length > 1 ? "multiplos" : "nao_localizado";
      if (escolhidos.length === 1) pagamento = { ...escolhidos[0], data: escolhidos[0].data_transacao };
    }
    return { nfs_stage_id: n.id, numero: n.nf_numero, emissao: n.nf_data_emissao, prestador: prestador ?? n.fornecedor_razao_social, cnpj: n.fornecedor_cnpj,
      ...r, grupo, situacao, pagamento, candidatos };
  };
  const itens = [];
  for (const l of comA) itens.push(await montar(l, "emitida", vincA.find((x: any) => x.nfs_stage_id === l.n.id)));
  const pagas = [];
  for (const l of comB) pagas.push(await montar(l, "paga_no_mes", pagosNoMes.find((x: any) => x.nfs_stage_id === l.n.id)));
  const em_aberto = [];
  for (const l of comC) em_aberto.push(await montar(l, "em_aberto", null));
  const itens_planilha = [...itens, ...pagas];
  const t = (k: keyof RetencoesNfse) => Math.round(itens_planilha.reduce((a, i: any) => a + Number(i[k] ?? 0), 0) * 100) / 100;
  return {
    total_nfse: nfs.length, lidas: lidasA, erros_leitura: erros,
    pdf: { com_pdf: nfs.filter((n: any) => n.resumo_pdf_storage_path).length, sem_pdf: nfs.filter((n: any) => !n.resumo_pdf_storage_path).length },
    com_retencao: itens_planilha.length,
    totais: { bruto: t("bruto"), ir: t("ir"), pis: t("pis"), cofins: t("cofins"), csll: t("csll"), inss: t("inss"), liquido: t("liquido") },
    nao_localizados: itens.filter((i) => i.situacao !== "vinculado").length,
    itens, pagas_no_mes: pagas, em_aberto, itens_planilha,
    nfse: nfs.map((n: any) => ({ id: n.id, numero: n.nf_numero, prestador: n.fornecedor_razao_social, resumo_pdf_storage_path: n.resumo_pdf_storage_path })),
  };
}

export const CABECALHO_RETENCOES = ["Nº da NFS-e", "Data de emissão", "Valor bruto", "Possui retenção IR? (Sim/Não)", "Retenção IR 1,5%",
  "Possui retenções PIS/COFINS/CSLL? (Sim/Não)", "PIS 0,65%", "COFINS 3%", "CSLL 1%", "Possui retenção INSS? (Sim/Não)",
  "Alíquota INSS (3,5% ou 11%)", "Retenção INSS", "Valor do pagamento", "Data do pagamento", "Observação"];

const dBr = (d: string | null | undefined) => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "";

export function linhaRetencao(i: any): (string | number)[] {
  const sn = (b: boolean) => (b ? "Sim" : "Não");
  const obs = [...(i.observacoes ?? [])];
  const pago = i.situacao === "vinculado";
  if (!pago) obs.push(i.situacao === "multiplos" ? "mais de um candidato — escolher" : i.situacao === "candidato" ? "pagamento não confirmado (candidato encontrado)" : "pagamento não localizado");
  if (pago && Math.abs(Number(i.pagamento.valor) - Number(i.liquido)) > 0.01) obs.push(`valor pago difere do líquido calculado (R$ ${Number(i.liquido).toFixed(2).replace(".", ",")})`);
  if (i.grupo === "paga_no_mes" && pago) obs.unshift(obsPagaNoMes(String(i.emissao), String(i.pagamento.data)));
  obs.unshift(`Prestador: ${i.prestador ?? "?"}`);
  return [i.numero ?? "", dBr(i.emissao), i.bruto, sn(i.ir > 0), i.ir, sn(i.pis + i.cofins + i.csll > 0), i.pis, i.cofins, i.csll,
    sn(i.inss > 0), i.inss_aliquota != null ? `${String(i.inss_aliquota).replace(".", ",")}%` : "", i.inss,
    pago ? i.pagamento.valor : "", pago ? dBr(i.pagamento.data) : "", obs.join("; ")];
}

export function xlsxRetencoes(itens: any[], mesAno: string): Uint8Array {
  const aoa = [[`Planilha de Pagamentos das Notas Fiscais de Serviços Tomados — ${mesAno}`], CABECALHO_RETENCOES, ...itens.map(linhaRetencao)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = CABECALHO_RETENCOES.map((_, k) => ({ wch: k === 14 ? 70 : 16 }));
  for (let r = 2; r < aoa.length; r++) for (const c of [2, 4, 6, 7, 8, 11, 12]) { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref] && typeof ws[ref].v === "number") ws[ref].z = "#,##0.00"; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Serviços tomados");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
