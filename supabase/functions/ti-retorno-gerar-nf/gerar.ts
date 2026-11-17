import { BlingHttpError, type BlingClient } from "../_shared/bling/bling-client.ts";

export const CNPJ_MATRIZ = "63591078000148";
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const pausa = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function desdeSp(agora = new Date()) {
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(agora);
  return new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
}
type Produto = { sku: string; codigo_externo: string | null; nome_operacional?: string | null; nome_completo?: string | null; ncm: string | null; origem_fisc: string | null };
export function montarPayload(d: {
  codigo: string; remessa: string; numero: string; chave: string; naturezaId: number;
  contato: Record<string, unknown>; contagem: { sku: string; recebido: number }[];
  custos: { sku: string; valor_unitario: number | null }[]; produtos: Produto[];
}) {
  if (!/^\d{44}$/.test(d.chave)) throw new Error("Chave da NF de remessa inválida.");
  const itens = d.contagem.filter((i) => i.recebido > 0).map((i) => {
    const p = d.produtos.find((p) => p.sku === i.sku);
    const custo = d.custos.find((p) => p.sku === i.sku)?.valor_unitario;
    if (!p?.codigo_externo?.trim() || !p.ncm || p.origem_fisc == null || p.origem_fisc === "" || !Number.isFinite(Number(p.origem_fisc)) || custo == null || !Number.isFinite(custo) || custo < 0) {
      throw new Error(`SKU ${i.sku} com cadastro incompleto — confira codigo_externo, NCM, origem fiscal e custo.`);
    }
    if (!Number.isFinite(i.recebido) || i.recebido <= 0) throw new Error(`Contagem inválida: ${i.sku}`);
    return { codigo: p.codigo_externo.trim(), descricao: p.nome_operacional || p.nome_completo || i.sku, unidade: "UN", quantidade: i.recebido, valor: custo, tipo: "P", classificacaoFiscal: p.ncm, origem: Number(p.origem_fisc) };
  });
  if (!itens.length) throw new Error("Nenhuma peça recebida — não há NF de retorno a gerar.");
  return { tipo: 0, finalidade: 1, contato: d.contato, naturezaOperacao: { id: d.naturezaId }, itens,
    documentoReferenciado: { modelo: "55", chaveAcesso: d.chave }, parcelas: [], transporte: { fretePorConta: 9 },
    observacoes: `Retorno de venda fora do estabelecimento — ${d.codigo} · Ref. NF ${d.numero} (${d.remessa}). SNCF.` };
}
type Nota = { id: number; numero: string };
export type Busca = { achou: Nota } | { nenhuma: true } | { ambigua: Nota[] } | { incompleta: true };
export async function buscarNfRetorno(bling: Pick<BlingClient, "get">, criterio: { codigo: string; naturezaId: number; desde: string; itens: { codigo: string; quantidade: number }[] }, esperar = pausa): Promise<Busca> {
  const esperado = new Map<string, number>();
  for (const i of criterio.itens) esperado.set(i.codigo, (esperado.get(i.codigo) ?? 0) + i.quantidade);
  const achadas = new Map<number, Nota>(); let detalhes = 0;
  try {
    for (let pagina = 1; pagina <= 2; pagina++) {
      const res = await bling.get(`/nfe?tipo=0&dataEmissaoInicial=${criterio.desde}&limite=100&pagina=${pagina}`);
      if (!Array.isArray(res?.data)) return { incompleta: true };
      for (const n of res.data) {
        if (n.contato?.numeroDocumento && digitos(n.contato.numeroDocumento) !== CNPJ_MATRIZ) continue;
        if (n.naturezaOperacao?.id != null && Number(n.naturezaOperacao.id) !== criterio.naturezaId) continue;
        if (detalhes >= 40) return { incompleta: true };
        if (!Number.isFinite(Number(n.id)) || Number(n.id) <= 0) return { incompleta: true };
        if (detalhes) await esperar(300);
        detalhes++;
        const nf = (await bling.get(`/nfe/${n.id}`))?.data;
        if (!nf) return { incompleta: true };
        if (Number(nf.naturezaOperacao?.id) !== criterio.naturezaId || digitos(nf.contato?.numeroDocumento) !== CNPJ_MATRIZ || !String(nf.observacoes ?? "").includes(criterio.codigo)) continue;
        if ([2, 3].includes(Number(nf.situacao))) continue; // cancelada/denegada não é candidata viva
        if (!Array.isArray(nf.itens)) continue;
        const recebido = new Map<string, number>();
        for (const i of nf.itens) recebido.set(String(i.codigo), (recebido.get(String(i.codigo)) ?? 0) + Number(i.quantidade));
        if (recebido.size !== esperado.size || [...esperado].some(([c, q]) => !Number.isFinite(recebido.get(c)) || Math.abs((recebido.get(c) ?? -1) - q) > 1e-6)) continue;
        achadas.set(Number(n.id), { id: Number(n.id), numero: String(nf.numero ?? n.numero ?? "") });
      }
      if (res.data.length < 100) return achadas.size > 1 ? { ambigua: [...achadas.values()] } : achadas.size === 1 ? { achou: [...achadas.values()][0] } : { nenhuma: true };
    }
    return { incompleta: true };
  } catch { return { incompleta: true }; }
}
export async function criarOuRecuperar(bling: Pick<BlingClient, "get" | "post">, payload: ReturnType<typeof montarPayload>, codigo: string, vinhaDeErro: boolean, esperar = pausa): Promise<Nota & { recuperado: boolean }> {
  const criterio = { codigo, naturezaId: payload.naturezaOperacao.id, itens: payload.itens, desde: desdeSp() };
  const decidir = (r: Busca) => {
    if ("ambigua" in r) throw new Error(`Há ${r.ambigua.length} notas iguais no Bling — exclua as duplicadas antes de tentar de novo.`);
    if ("incompleta" in r) throw new Error(`Busca incompleta da NF de ${codigo} — confira no Bling antes de tentar de novo.`);
    return "achou" in r ? { ...r.achou, recuperado: true } : null;
  };
  if (vinhaDeErro) {
    const nota = decidir(await buscarNfRetorno(bling, criterio, esperar));
    if (nota) return nota;
  }
  try {
    const res = await bling.post("/nfe", payload, { retry: false });
    const id = Number(res?.data?.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Bling respondeu sem id confirmado.");
    let numero = String(res?.data?.numero ?? "");
    if (!numero) numero = String((await bling.get(`/nfe/${id}`))?.data?.numero ?? "");
    if (!numero) throw new Error(`NF criada com id ${id}, mas sem número confirmado — confira no Bling antes de tentar de novo.`);
    return { id, numero, recuperado: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof BlingHttpError && e.status < 500 && e.status !== 429 && !/duplic|ja existe|já existe/i.test(msg)) throw e;
    for (let i = 0; i < 4; i++) {
      await esperar(5000);
      const nota = decidir(await buscarNfRetorno(bling, criterio, esperar));
      if (nota) return nota;
    }
    throw new Error(`Bling não confirmou a NF de ${codigo} após 4 buscas — confira no Bling antes de tentar de novo. ${msg}`);
  }
}