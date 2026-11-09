import { BlingHttpError, type BlingClient } from "../_shared/bling/bling-client.ts";

type Item = { sku: string; descricao: string; unidade: string | null; quantidade: number; valor: number; ncm: string | null; origem: number | null };
export type DadosSubstituta = {
  destinatario: { id?: number; nome: string; numeroDocumento: string; tipoPessoa: string };
  loja_bling_id: number; natureza_bling_id: number; mesma_natureza_original: boolean;
  itens: Item[]; parcelas: unknown[]; transporte: Record<string, unknown>;
  valor_frete: number; observacoes: string; valor: number;
};
const mensagem = (e: unknown): string => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function payloadSubstituta(d: DadosSubstituta, agora = new Date()) {
  if (!d?.itens?.length) throw new Error("Correção sem itens para a NF nova.");
  if (!d.natureza_bling_id || !d.loja_bling_id || !d.destinatario?.numeroDocumento) throw new Error("NF nova sem natureza, loja ou documento do destinatário.");
  if (!Number.isFinite(Number(d.valor))) throw new Error("Valor esperado da NF nova inválido.");
  const dataOperacao = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(agora).replace(",", "");
  return {
    tipo: 1, finalidade: 1, dataOperacao, contato: d.destinatario,
    loja: { id: Number(d.loja_bling_id) }, naturezaOperacao: { id: Number(d.natureza_bling_id) },
    itens: d.itens.map((i) => ({ codigo: i.sku, descricao: i.descricao, unidade: i.unidade || "UN", quantidade: i.quantidade, valor: i.valor, tipo: "P", classificacaoFiscal: i.ncm, origem: i.origem })),
    parcelas: d.parcelas ?? [], transporte: { ...d.transporte, ...(Number(d.valor_frete) > 0 ? { frete: Number(d.valor_frete) } : {}) }, observacoes: d.observacoes,
  };
}

// A recuperação nunca escolhe pela proximidade: exige correspondência de documento, total e todos os itens.
export function candidataSubstituta(nf: any, d: DadosSubstituta): boolean {
  if (Number(nf?.tipo) !== 1 || Number(nf?.situacao) !== 1) return false;
  if (digitos(nf?.contato?.numeroDocumento) !== digitos(d.destinatario.numeroDocumento)) return false;
  if (!Number.isFinite(Number(nf?.valorNota)) || Math.abs(Number(nf.valorNota) - Number(d.valor)) > 0.020000001) return false;
  if (nf?.loja?.id && Number(nf.loja.id) !== Number(d.loja_bling_id)) return false;
  const somar = (xs: Array<{ codigo: string; quantidade: number; valor: number }>) => {
    const m = new Map<string, { q: number; v: number }>();
    for (const i of xs) {
      const k = String(i.codigo ?? "").trim(); const a = m.get(k) ?? { q: 0, v: 0 };
      m.set(k, { q: a.q + Number(i.quantidade), v: a.v + Number(i.quantidade) * Number(i.valor) });
    }
    return m;
  };
  const atual = somar(nf?.itens ?? []);
  const esperado = somar(d.itens.map((i) => ({ codigo: i.sku, quantidade: i.quantidade, valor: i.valor })));
  if (atual.size !== esperado.size) return false;
  for (const [sku, item] of esperado) {
    const a = atual.get(sku);
    if (!a || !Number.isFinite(a.q) || !Number.isFinite(a.v) || Math.abs(a.q - item.q) > 0.0001 || Math.abs(a.v - item.v) > 0.020000001) return false;
  }
  return true;
}

type Dependencias = {
  bling: Pick<BlingClient, "get" | "post">;
  registrar: (status: "rascunho" | "erro", id: number | null, numero: string | null, erro: string | null) => Promise<unknown>;
  idsUsados: () => Promise<Set<number>>;
};
export async function gerarSubstituta(d: DadosSubstituta, deps: Dependencias) {
  let id: number | null = null;
  let numero: string | null = null;
  try {
    const payload = payloadSubstituta(d);
    let resposta: any;
    let nf: any;
    try {
      resposta = await deps.bling.post("/nfe", payload, { retry: false });
      const recebido = Number(resposta?.data?.id);
      if (!Number.isSafeInteger(recebido) || recebido <= 0) throw new Error("Bling retornou sucesso sem id da NF nova; criação incerta.");
      id = recebido;
      numero = resposta?.data?.numero != null ? String(resposta.data.numero) : null;
    } catch (e) {
      const duplicidade = normalizar(`${mensagem(e)} ${e instanceof BlingHttpError ? e.corpo : ""}`).includes("ja existe uma nota fiscal cadastrada");
      const incerto = !(e instanceof BlingHttpError) || e.status >= 500 || e.status === 429;
      if (!duplicidade && !incerto) throw e;
      const usados = await deps.idsUsados();
      const candidatas = new Map<number, any>();
      let completa = false;
      for (let pagina = 1; pagina <= 50; pagina++) {
        const r = await deps.bling.get(`/nfe?tipo=1&situacao=1&pagina=${pagina}&limite=100`);
        if (!Array.isArray(r?.data)) throw new Error("Bling retornou lista de NFs inválida durante a recuperação.");
        for (const n of r.data) {
          const candidatoId = Number(n.id);
          if (!Number.isSafeInteger(candidatoId) || candidatoId <= 0 || usados.has(candidatoId)) continue;
          if (n.contato?.numeroDocumento && digitos(n.contato.numeroDocumento) !== digitos(d.destinatario.numeroDocumento)) continue;
          const lida = (await deps.bling.get(`/nfe/${candidatoId}`))?.data;
          if (candidataSubstituta(lida, d)) candidatas.set(candidatoId, lida);
        }
        if (r.data.length < 100) { completa = true; break; }
      }
      if (!completa || candidatas.size !== 1) throw new Error(`Bling não confirmou a criação da NF nova — confira as NFs de saída pendentes no Bling antes de tentar novamente. (${candidatas.size} candidata(s)${completa ? "" : "; busca incompleta"}; erro original: ${mensagem(e)})`);
      const candidata = candidatas.entries().next().value;
      if (!candidata) throw new Error("NF nova não identificada.");
      [id, nf] = candidata;
      numero = nf.numero != null ? String(nf.numero) : null;
    }
    const alertas: unknown[] = Array.isArray(resposta?.data?.alertas) ? [...resposta.data.alertas] : [];
    if (d.mesma_natureza_original) alertas.push("A NF nova sai com a mesma natureza da original — confira se o problema era outro");
    if (!nf) {
      try {
        nf = (await deps.bling.get(`/nfe/${id}`))?.data;
        if (!nf) throw new Error("Bling não retornou os dados da NF criada.");
      } catch (e) {
        // O POST já confirmou o id: não liberar uma segunda criação por falha no GET.
        alertas.push(`NF criada, mas a leitura de volta falhou: ${mensagem(e)} — confira no Bling antes de transmitir`);
      }
    }
    if (nf) {
      numero = nf.numero != null ? String(nf.numero) : numero;
      const valor = Number(nf.valorNota);
      if (!Number.isFinite(valor)) alertas.push("Bling não informou o valor da NF nova — confira antes de transmitir");
      else if (Math.abs(valor - Number(d.valor)) > 0.020000001) alertas.push(`Valor da NF no Bling (${brl(valor)}) diferente do esperado (${brl(Number(d.valor))}) — confira antes de transmitir`);
    }
    await deps.registrar("rascunho", id, numero, null);
    return { ok: true, numero, bling_nfe_id: id, alertas };
  } catch (e) {
    const erro = mensagem(e);
    try { await deps.registrar("erro", id, numero, erro); }
    catch (re) { throw new Error(`${erro} · Falha ao registrar o erro: ${mensagem(re)}`); }
    throw new Error(erro);
  }
}