import type { BlingClient } from "../_shared/bling/bling-client.ts";

export const CNPJ_MATRIZ = "63591078000148";
export type NaturezaFiscal = { familia_processo: string; exige_expedicao: boolean; bling_natureza_id: number | string | null };
export function recusaTrs(natureza: NaturezaFiscal | null, direta: boolean, blingPedidoId: unknown, ti = false): string | null {
  if (blingPedidoId != null) return "Transferência já enviada por pedido de venda ao Bling — não é permitido criar NF direta.";
  if (!natureza || (!ti && natureza.familia_processo !== "transferencia")) return "Pedido não é uma transferência com natureza de operação definida.";
  // TRS-FISICA-NF-DIRETA (25/11/2026): física só sai por NF direta quando a natureza está habilitada.
  if (!ti && natureza.exige_expedicao !== false && !direta) return "Transferência física: mantenha o envio por pedido de venda ao Bling.";
  if (ti && natureza.bling_natureza_id == null) return "Natureza da NF de remessa sem id no Bling — a Eva precisa cadastrar a natureza no Bling com o CFOP indicado pelo contador. Nada foi criado.";
  if (!direta) return "Natureza não habilitada para gerar NF direta.";
  if (!Number.isSafeInteger(Number(natureza.bling_natureza_id)) || Number(natureza.bling_natureza_id) <= 0) return "Natureza sem natureza fiscal do Bling configurada.";
  return null;
}
export type DadosTrs = {
  codigo: string; naturezaId: number; lojaId: number;
  contato: { id: number; numeroDocumento: string };
  itens: Array<{ sku: string; descricao: string; quantidade: number; valor: number; produtoId: number; origem: number }>;
  transporte?: { fretePorConta: number; contato?: { id: number }; quantidadeVolumes: number; pesoBruto: number };
  observacao?: string;
};
export function transporteTi(metadata: unknown): NonNullable<DadosTrs["transporte"]> {
  const m = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const volumes = Number(m.volumes), peso = Number(m.peso_kg);
  if (!Number.isSafeInteger(volumes) || volumes < 1 || !Number.isFinite(peso) || peso <= 0) throw new Error("Registre a embalagem na Mesa SP antes de gerar a NF de remessa.");
  return { fretePorConta: 3, quantidadeVolumes: volumes, pesoBruto: peso };
}
// Bling v3: transportadora vive em transporte.contato. Peso/volumes sempre os informados pela XPM.
export function transporteFisica(x: { modFrete: unknown; transportadoraBlingId: unknown; volumes: unknown; peso: unknown }): NonNullable<DadosTrs["transporte"]> {
  const mod = x.modFrete == null || x.modFrete === "" ? NaN : Number(x.modFrete);
  if (!Number.isInteger(mod) || mod < 0) throw new Error("Tipo de frete da TRS sem modalidade de NF (frete_tipos).");
  const tid = x.transportadoraBlingId == null || x.transportadoraBlingId === "" ? NaN : Number(x.transportadoraBlingId);
  if (!Number.isSafeInteger(tid) || tid <= 0) throw new Error("Transportadora da TRS sem contato no Bling — sincronize antes.");
  const volumes = x.volumes == null ? NaN : Number(x.volumes), peso = x.peso == null ? NaN : Number(x.peso);
  if (!Number.isSafeInteger(volumes) || volumes < 1 || !Number.isFinite(peso) || peso <= 0) throw new Error("A XPM ainda não informou volumes e peso desta TRS.");
  return { fretePorConta: mod, contato: { id: tid }, quantidadeVolumes: volumes, pesoBruto: Math.round(peso * 1000) / 1000 };
}
export const observacaoFisica = (codigo: string, destino: string) => `Transferência ${codigo} XPM-SC → ${destino} via SNCF.`;
export function payloadTrs(d: DadosTrs, agora = new Date()) {
  if (!d.codigo.trim() || !d.naturezaId || !d.lojaId || !d.contato.id || d.contato.numeroDocumento.replace(/\D/g, "") !== CNPJ_MATRIZ) throw new Error("NF de transferência sem código, natureza, filial SC ou destinatário matriz válido.");
  if (!d.itens.length || d.itens.some(i => !i.sku || !Number.isSafeInteger(i.produtoId) || i.produtoId <= 0 || !Number.isFinite(i.quantidade) || i.quantidade <= 0 || !Number.isFinite(i.valor) || i.valor < 0)) throw new Error("Itens da transferência com produto, quantidade ou custo inválidos.");
  const semOrigem = d.itens.filter(i => !Number.isInteger(i.origem) || i.origem < 0 || i.origem > 8);
  if (semOrigem.length) throw new Error(`SKU(s) sem origem fiscal no cadastro: ${[...new Set(semOrigem.map(i => i.sku))].join(", ")} — nada foi criado.`);
  return {
    tipo: 1, finalidade: 1,
    dataOperacao: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(agora).replace(",", ""),
    naturezaOperacao: { id: d.naturezaId }, loja: { id: d.lojaId }, contato: d.contato,
    numeroPedidoLoja: d.codigo,
    itens: d.itens.map(i => ({ codigo: i.sku, produto: { id: i.produtoId }, descricao: i.descricao, unidade: "UN", quantidade: i.quantidade, valor: i.valor, tipo: "P", origem: i.origem })),
    parcelas: [], transporte: d.transporte ?? { fretePorConta: 9 }, observacoes: d.observacao ?? `Transferência fiscal ${d.codigo} via SNCF — somente rascunho; transmitir no Bling após conferência.`,
  };
}
export const valorTrs = (d: DadosTrs) => Math.round(d.itens.reduce((s, i) => s + i.quantidade * i.valor, 0) * 100) / 100;
export type Registro = { status: string; bling_nfe_id: number | null; numero: string | null; natureza_conferida: boolean; erro: string | null };
type Deps = { bling: Pick<BlingClient, "get" | "post">; registrar: (r: Registro) => Promise<void>; evento: (descricao: string) => Promise<void>; criadoEm?: string; agora?: Date; esperar?: (ms: number) => Promise<void> };
const msg = (e: unknown) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
const pausa = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export function desdeRecuperacao(criadoEm?: string, agora = new Date()): string {
  const data = criadoEm == null ? agora : new Date(criadoEm);
  if (!Number.isFinite(data.getTime())) throw new Error("Data de criação da NF inválida — confira no Bling antes de tentar de novo.");
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
  const margem = new Date(`${local}T12:00:00Z`);
  margem.setUTCDate(margem.getUTCDate() - 1);
  return margem.toISOString().slice(0, 10);
}
export type CriterioNfDireta = { codigo: string; naturezaId: number; lojaId: number; valorEsperado: number; desde: string };
export type RecuperacaoNfDireta = { achou: number } | { nenhuma: true } | { ambigua: number[] } | { incompleta: true };
export async function recuperarNfDireta(bling: Pick<BlingClient, "get">, criterio: CriterioNfDireta, esperar = pausa): Promise<RecuperacaoNfDireta> {
  const ids = new Set<number>(), lidos = new Set<number>();
  let detalhes = 0;
  const matriz = (contato: { numeroDocumento?: unknown } | null | undefined) => String(contato?.numeroDocumento ?? "").replace(/\D/g, "") === CNPJ_MATRIZ;
  try {
    for (let pagina = 1; pagina <= 2; pagina++) {
      const r = await bling.get(`/nfe?tipo=1&dataEmissaoInicial=${criterio.desde}&limite=100&pagina=${pagina}`);
      if (!Array.isArray(r?.data)) return { incompleta: true };
      for (const n of r.data) {
        if (!n || typeof n !== "object") return { incompleta: true };
        if (n.naturezaOperacao?.id != null && Number(n.naturezaOperacao.id) !== criterio.naturezaId) continue;
        if (n.loja?.id != null && Number(n.loja.id) !== criterio.lojaId) continue;
        if (n.contato != null && !matriz(n.contato)) continue;
        const id = Number(n.id);
        if (!Number.isSafeInteger(id) || id <= 0) return { incompleta: true };
        if (lidos.has(id)) continue;
        if (detalhes >= 40) return { incompleta: true };
        if (detalhes > 0) await esperar(300);
        detalhes++;
        lidos.add(id);
        const nf = (await bling.get(`/nfe/${id}`))?.data;
        if (!nf || typeof nf !== "object") return { incompleta: true };
        if (Number(nf.naturezaOperacao?.id) !== criterio.naturezaId) continue;
        if (nf.loja?.id != null && Number(nf.loja.id) !== criterio.lojaId) continue;
        if (!matriz(nf.contato) || !String(nf.observacoes ?? "").includes(criterio.codigo)) continue;
        if (nf.valorNota == null || !Number.isFinite(Number(nf.valorNota)) || Math.abs(Number(nf.valorNota) - criterio.valorEsperado) > 0.020000001) continue;
        ids.add(id);
      }
      if (r.data.length < 100) {
        if (ids.size > 1) return { ambigua: [...ids] };
        const id = ids.values().next().value;
        return id == null ? { nenhuma: true } : { achou: id };
      }
    }
  } catch { return { incompleta: true }; }
  return { incompleta: true };
}
function falhaIncerta(e: unknown): boolean {
  const status = e && typeof e === "object" && "status" in e ? Number(e.status) : null;
  if (status != null && Number.isFinite(status)) return status >= 500 && status < 600;
  return e instanceof TypeError || (e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name)) || /\b5\d\d\b|timeout|timed out|network|fetch failed|failed to fetch|erro de rede|connection|socket/i.test(msg(e));
}

export async function gerarTrs(d: DadosTrs, recuperar: boolean, deps: Deps) {
  let id: number | null = null;
  let numero: string | null = null;
  try {
    const payload = payloadTrs(d);
    const esperar = deps.esperar ?? pausa;
    const criterio = { codigo: d.codigo, naturezaId: d.naturezaId, lojaId: d.lojaId, valorEsperado: valorTrs(d) };
    let recuperadaAposFalha = false;
    if (recuperar) {
      const r = await recuperarNfDireta(deps.bling, { ...criterio, desde: desdeRecuperacao(deps.criadoEm, deps.agora) }, esperar);
      if ("achou" in r) id = r.achou;
      else if (!("nenhuma" in r)) throw new Error(`Não foi possível confirmar se a NF de ${d.codigo} já existe no Bling (ids: ${"ambigua" in r ? r.ambigua.join(", ") : "não confirmados"}). Confira no Bling antes de tentar de novo — nada foi criado.`);
    }
    if (!id) {
      let resposta;
      try { resposta = await deps.bling.post("/nfe", payload, { retry: false }); }
      catch (e) {
        if (!falhaIncerta(e)) throw e;
        await esperar(5000);
        const r = await recuperarNfDireta(deps.bling, { ...criterio, desde: desdeRecuperacao(undefined, deps.agora) }, esperar);
        if ("achou" in r) { id = r.achou; recuperadaAposFalha = true; }
        else if ("nenhuma" in r) throw new Error("O Bling não respondeu e a NF não foi encontrada — pode tentar de novo.");
        else throw new Error(`O Bling não respondeu; confira no Bling se a NF de ${d.codigo} foi criada antes de tentar de novo.`);
      }
      if (!id) {
        const recebido = Number(resposta?.data?.id);
        if (!Number.isSafeInteger(recebido) || recebido <= 0) throw new Error("Bling não confirmou o id da NF; confira antes de tentar novamente.");
        id = recebido;
        numero = resposta?.data?.numero == null ? null : String(resposta.data.numero);
      }
    }
    // Persistir o id ANTES da leitura de volta: falha de GET nunca autoriza outro POST.
    await deps.registrar({ status: "gerando", bling_nfe_id: id, numero, natureza_conferida: false, erro: null });
    const nf = (await deps.bling.get(`/nfe/${id}`))?.data;
    if (!nf) throw new Error("NF criada, mas leitura de volta falhou — confira no Bling antes de transmitir.");
    numero = nf.numero == null ? numero : String(nf.numero);
    const naturezaConferida = Number(nf.naturezaOperacao?.id) === d.naturezaId;
    const alertas: string[] = [];
    if (!naturezaConferida) alertas.push("Bling não confirmou a natureza — confira antes de transmitir.");
    if (!Number.isFinite(Number(nf.valorNota)) || Math.abs(Number(nf.valorNota) - valorTrs(d)) > 0.020000001) alertas.push("Valor total da NF diverge do custo da transferência — confira antes de transmitir.");
    await deps.registrar({ status: "rascunho", bling_nfe_id: id, numero, natureza_conferida: naturezaConferida, erro: null });
    await deps.evento(`NF de transferência fiscal criada direto no Bling — rascunho nº ${numero ?? "não informado"}, id ${id}; natureza conferida: ${naturezaConferida ? "sim" : "não"}; próximo passo: transmitir${recuperadaAposFalha ? " · criada apesar do 504" : ""}${alertas.length ? ` · ${alertas.join(" · ")}` : ""}`);
    return { ok: true, status: "rascunho", bling_nfe_id: id, numero, natureza_conferida: naturezaConferida, alertas };
  } catch (e) {
    const erro = msg(e);
    try { await deps.registrar({ status: "erro", bling_nfe_id: id, numero, natureza_conferida: false, erro }); }
    catch (re) { throw new Error(`${erro} · Falha ao registrar: ${msg(re)}`); }
    throw new Error(erro);
  }
}