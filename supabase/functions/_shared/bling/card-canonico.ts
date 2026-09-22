// CARD-CANÔNICO (22/09/2026) — escolha determinística do card do Bling por SKU.
//
// O catálogo do Bling tem cards duplicados do mesmo produto (923 SKUs com 2+ cards).
// Antes, cada caminho escolhia por conta própria: a cache guardava "o último da
// paginação" e o envio pegava o primeiro `.find()` da API. Mesmo SKU descia com card
// diferente conforme a ordem em que o Bling devolvesse os dados — e a NF saía com o
// nome/card errado.
//
// A partir de agora a fonte de verdade é a tabela `bling_card_canonico` (uma linha por
// SKU, preenchida pela RPC `fn_bling_card_canonico_recalcular`). Este módulo só LÊ.
//
// Degraus de resolução (mesma ordem em todo consumidor):
//   1. bling_card_canonico  → fonte "canonico"
//   2. bling_produtos_cache → fonte "cache"
//   3. API do Bling         → fonte "api" (com desempate explícito, nunca o primeiro)

export type FonteResolucaoCard = "canonico" | "cache" | "api";

/** Chave de casamento: SKU sem espaço/tab e em caixa alta (o Bling grava com tab invisível). */
export function chaveSku(sku: unknown): string {
  return String(sku ?? "").trim().toUpperCase();
}

/**
 * Lê os cards canônicos dos SKUs pedidos. Casamento case-insensitive: consulta as
 * variantes (como veio, maiúscula, minúscula) e indexa pela chave normalizada.
 * Retorna mapa chaveSku → bling_id.
 */
export async function lerCardsCanonicos(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  skus: string[],
): Promise<Record<string, number>> {
  const mapa: Record<string, number> = {};
  const limpos = [...new Set(skus.map((s) => String(s ?? "").trim()).filter(Boolean))];
  if (limpos.length === 0) return mapa;

  const variantes = [
    ...new Set(limpos.flatMap((s) => [s, s.toUpperCase(), s.toLowerCase()])),
  ];

  const { data, error } = await supabase
    .from("bling_card_canonico")
    .select("sku, bling_id")
    .in("sku", variantes);
  if (error) throw new Error(`ler bling_card_canonico: ${error.message}`);

  for (const row of data ?? []) {
    const id = Number(row.bling_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    mapa[chaveSku(row.sku)] = id;
  }
  return mapa;
}

// deno-lint-ignore no-explicit-any
type CandidatoBling = any;

function ativo(p: CandidatoBling): boolean {
  return String(p?.situacao ?? "").trim().toUpperCase() === "A";
}

function estoque(p: CandidatoBling): number {
  const e = p?.estoque ?? {};
  const v = e.saldoVirtualTotal ?? e.saldoFisicoTotal ?? e.saldoVirtual ?? e.saldoFisico ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nomeNormalizado(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Desempate quando a API devolve mais de um card com o mesmo código.
 * Mesma ordem da regra da RPC: ativo → nome igual ao do catálogo → maior estoque.
 * Empate total resolve pelo menor id (estável entre execuções, ao contrário da
 * ordem da resposta da API).
 */
export function escolherCandidatoApi(
  candidatos: CandidatoBling[],
  skuTrim: string,
  nomeCatalogo?: string | null,
): { id: number; total: number; motivo: string } | null {
  const alvo = chaveSku(skuTrim);
  const casam = (candidatos ?? []).filter(
    (p) => chaveSku(p?.codigo) === alvo && Number(p?.id) > 0,
  );
  if (casam.length === 0) return null;
  if (casam.length === 1) return { id: Number(casam[0].id), total: 1, motivo: "candidato_unico" };

  const nomeAlvo = nomeNormalizado(nomeCatalogo);

  const ordenados = [...casam].sort((a, b) => {
    const porAtivo = Number(ativo(b)) - Number(ativo(a));
    if (porAtivo !== 0) return porAtivo;

    if (nomeAlvo) {
      const igualA = nomeNormalizado(a?.nome) === nomeAlvo ? 1 : 0;
      const igualB = nomeNormalizado(b?.nome) === nomeAlvo ? 1 : 0;
      if (igualA !== igualB) return igualB - igualA;
    }

    const porEstoque = estoque(b) - estoque(a);
    if (porEstoque !== 0) return porEstoque;

    return Number(a.id) - Number(b.id);
  });

  const vencedor = ordenados[0];
  const motivo = ativo(vencedor)
    ? nomeAlvo && nomeNormalizado(vencedor?.nome) === nomeAlvo
      ? "ativo_e_nome_do_catalogo"
      : "ativo_maior_estoque"
    : "inativo_maior_estoque";

  return { id: Number(vencedor.id), total: casam.length, motivo };
}
