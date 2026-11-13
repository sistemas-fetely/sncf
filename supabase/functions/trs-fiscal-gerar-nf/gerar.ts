import type { BlingClient } from "../_shared/bling/bling-client.ts";

export const CNPJ_MATRIZ = "63591078000148";
export type NaturezaFiscal = { familia_processo: string; exige_expedicao: boolean; bling_natureza_id: number | string | null };
export function recusaTrs(natureza: NaturezaFiscal | null, direta: boolean, blingPedidoId: unknown): string | null {
  if (blingPedidoId != null) return "Transferência já enviada por pedido de venda ao Bling — não é permitido criar NF direta.";
  if (!natureza || natureza.familia_processo !== "transferencia") return "Pedido não é uma transferência com natureza de operação definida.";
  if (natureza.exige_expedicao !== false) return "Transferência física: mantenha o envio por pedido de venda ao Bling.";
  if (!direta) return "Natureza não habilitada para gerar NF direta.";
  if (!Number.isSafeInteger(Number(natureza.bling_natureza_id)) || Number(natureza.bling_natureza_id) <= 0) return "Natureza sem natureza fiscal do Bling configurada.";
  return null;
}
export type DadosTrs = {
  codigo: string; naturezaId: number; lojaId: number;
  contato: { id: number; numeroDocumento: string };
  itens: Array<{ sku: string; descricao: string; quantidade: number; valor: number; produtoId: number }>;
};
export function payloadTrs(d: DadosTrs, agora = new Date()) {
  if (!d.codigo.trim() || !d.naturezaId || !d.lojaId || !d.contato.id || d.contato.numeroDocumento.replace(/\D/g, "") !== CNPJ_MATRIZ) throw new Error("NF de transferência sem código, natureza, filial SC ou destinatário matriz válido.");
  if (!d.itens.length || d.itens.some(i => !i.sku || !Number.isSafeInteger(i.produtoId) || i.produtoId <= 0 || !Number.isFinite(i.quantidade) || i.quantidade <= 0 || !Number.isFinite(i.valor) || i.valor < 0)) throw new Error("Itens da transferência com produto, quantidade ou custo inválidos.");
  return {
    tipo: 1, finalidade: 1,
    dataOperacao: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(agora).replace(",", ""),
    naturezaOperacao: { id: d.naturezaId }, loja: { id: d.lojaId }, contato: d.contato,
    numeroPedidoLoja: d.codigo,
    itens: d.itens.map(i => ({ codigo: i.sku, produto: { id: i.produtoId }, descricao: i.descricao, unidade: "UN", quantidade: i.quantidade, valor: i.valor, tipo: "P" })),
    parcelas: [], transporte: { fretePorConta: 9 }, observacoes: `Transferência fiscal ${d.codigo} via SNCF — somente rascunho; transmitir no Bling após conferência.`,
  };
}
export const valorTrs = (d: DadosTrs) => Math.round(d.itens.reduce((s, i) => s + i.quantidade * i.valor, 0) * 100) / 100;
export type Registro = { status: string; bling_nfe_id: number | null; numero: string | null; natureza_conferida: boolean; erro: string | null };
type Deps = { bling: Pick<BlingClient, "get" | "post">; registrar: (r: Registro) => Promise<void>; evento: (descricao: string) => Promise<void> };
const msg = (e: unknown) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);

export async function gerarTrs(d: DadosTrs, recuperar: boolean, deps: Deps) {
  let id: number | null = null;
  let numero: string | null = null;
  try {
    const payload = payloadTrs(d);
    if (recuperar) {
      const candidatas = new Set<number>();
      let completa = false;
      for (let pagina = 1; pagina <= 50; pagina++) {
        const r = await deps.bling.get(`/nfe?tipo=1&pagina=${pagina}&limite=100`);
        if (!Array.isArray(r?.data)) throw new Error("Lista de NFs inválida durante recuperação; nada foi criado.");
        for (const n of r.data) {
          if (n.contato?.numeroDocumento && String(n.contato.numeroDocumento).replace(/\D/g, "") !== CNPJ_MATRIZ) continue;
          const nf = (await deps.bling.get(`/nfe/${n.id}`))?.data;
          if (String(nf?.numeroPedidoLoja ?? "").trim() === d.codigo) {
            const candidatoId = Number(n.id);
            if (!Number.isSafeInteger(candidatoId) || candidatoId <= 0) throw new Error("NF encontrada sem id válido.");
            candidatas.add(candidatoId);
          }
        }
        if (r.data.length < 100) { completa = true; break; }
      }
      if (!completa || candidatas.size > 1) throw new Error("Recuperação de NF incompleta ou ambígua — confira no Bling; nada foi criado.");
      id = candidatas.values().next().value ?? null;
    }
    if (!id) {
      const resposta = await deps.bling.post("/nfe", payload, { retry: false });
      const recebido = Number(resposta?.data?.id);
      if (!Number.isSafeInteger(recebido) || recebido <= 0) throw new Error("Bling não confirmou o id da NF; confira antes de tentar novamente.");
      id = recebido;
      numero = resposta?.data?.numero == null ? null : String(resposta.data.numero);
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
    await deps.evento(`NF de transferência fiscal criada direto no Bling — rascunho nº ${numero ?? "não informado"}, id ${id}; natureza conferida: ${naturezaConferida ? "sim" : "não"}; próximo passo: transmitir${alertas.length ? ` · ${alertas.join(" · ")}` : ""}`);
    return { ok: true, status: "rascunho", bling_nfe_id: id, numero, natureza_conferida: naturezaConferida, alertas };
  } catch (e) {
    const erro = msg(e);
    try { await deps.registrar({ status: "erro", bling_nfe_id: id, numero, natureza_conferida: false, erro }); }
    catch (re) { throw new Error(`${erro} · Falha ao registrar: ${msg(re)}`); }
    throw new Error(erro);
  }
}