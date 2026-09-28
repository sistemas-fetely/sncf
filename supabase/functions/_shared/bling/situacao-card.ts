// Situação do card do Bling acompanha a FASE do produto (28/09/2026).
// Regra: fase "ativo" → card Ativo ("A"); qualquer outra fase → Inativo ("I").
// Card-alvo = o canônico (vw_bling_card_360.e_canonico). O PUT do Bling SUBSTITUI o cadastro
// inteiro: sempre GET antes e reenvia o objeto trocando só `situacao` (mesmo padrão do corrigir-produto-bling).
import { ensureFreshToken, makeBlingClient, BLING_BASE } from "./bling-client.ts";

export type ResultadoSituacao = { ok: boolean; acao: string; bling_id?: string; erro?: string };

// deno-lint-ignore no-explicit-any
export async function sincronizarSituacaoCardBling(supabase: any, sku: string, fase: string): Promise<ResultadoSituacao> {
  const alvo = fase === "ativo" ? "A" : "I";
  const { data: card, error } = await supabase
    .from("vw_bling_card_360").select("bling_id, card_ativo").eq("sku", sku).eq("e_canonico", true).maybeSingle();
  if (error) return { ok: false, acao: "erro", erro: `vw_bling_card_360: ${error.message}` };
  if (!card?.bling_id) return { ok: true, acao: "sem_card" };
  const blingId = String(card.bling_id);

  const { data: cfg, error: cfgErr } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (cfgErr) return { ok: false, acao: "erro", bling_id: blingId, erro: `config do Bling: ${cfgErr.message}` };
  if (!cfg?.access_token) return { ok: false, acao: "erro", bling_id: blingId, erro: "Bling não conectado" };

  try {
    // deno-lint-ignore no-explicit-any
    const client = makeBlingClient(supabase, cfg as any, await ensureFreshToken(supabase, cfg as any));
    const r = await client.get(`/produtos/${blingId}`);
    const atual = r?.data ?? null;
    if (!atual?.id) return { ok: false, acao: "erro", bling_id: blingId, erro: "GET /produtos retornou vazio" };

    if (String(atual.situacao ?? "") !== alvo) {
      const res = await fetch(`${BLING_BASE}/produtos/${blingId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${client.currentToken()}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...atual, situacao: alvo }),
      });
      if (!res.ok) return { ok: false, acao: "erro", bling_id: blingId, erro: `Bling PUT ${res.status}: ${(await res.text()).slice(0, 400)}` };
    }
    // Espelho local do card (base da vw_bling_card_360).
    const { error: espErr } = await supabase.from("produtos").update({ ativo: alvo === "A" }).eq("bling_id", blingId);
    if (espErr) return { ok: false, acao: "erro", bling_id: blingId, erro: `card alterado no Bling, mas o espelho falhou: ${espErr.message}` };
    return { ok: true, acao: String(atual.situacao ?? "") === alvo ? "ja_estava" : (alvo === "A" ? "ativado" : "desativado"), bling_id: blingId };
  } catch (e) {
    return { ok: false, acao: "erro", bling_id: blingId, erro: e instanceof Error ? e.message : String(e) };
  }
}
