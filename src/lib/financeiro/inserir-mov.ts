/**
 * REIMPORTAR-É-INOFENSIVO (01/09/2026)
 *
 * Um arquivo inteiro morria quando encontrava uma linha repetida:
 * `duplicate key value violates unique constraint "uq_mov_bancaria_transacao_viva"`.
 *
 * `movimentacoes_bancarias` tem três chaves de unicidade e duas delas são
 * ÍNDICES PARCIAIS (`uq_mov_bancaria_transacao_viva`, `ux_mov_bancarias_e2e_ativo`).
 * O PostgREST não infere índice parcial em `on conflict` — pedir isso devolve
 * 42P10. Então a estratégia é:
 *   1. lote com `ignoreDuplicates` na única chave total (`hash_unico`);
 *   2. se ainda escapar violação de unicidade (índice parcial), reinserir o lote
 *      linha por linha e contar cada 23505 como DUPLICADA.
 *
 * Uma linha repetida nunca derruba o arquivo.
 */

import type { ContagemImportacao } from "./contagem-importacao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const TAMANHO_LOTE = 100;

export function ehViolacaoUnicidade(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key value violates unique constraint/i.test(err.message ?? "");
}

/**
 * Insere linhas de extrato contando novas × duplicadas na `contagem`.
 * Nunca lança por conflito de unicidade — só por erro de verdade.
 */
export async function inserirMovimentacoes(
  sb: Client,
  rows: Record<string, unknown>[],
  contagem: ContagemImportacao
): Promise<void> {
  for (let i = 0; i < rows.length; i += TAMANHO_LOTE) {
    const lote = rows.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await sb
      .from("movimentacoes_bancarias")
      .upsert(lote, { onConflict: "hash_unico", ignoreDuplicates: true })
      .select("id");

    if (!error) {
      const inseridas = data?.length ?? 0;
      contagem.nova(inseridas);
      contagem.duplicada(lote.length - inseridas);
      continue;
    }

    if (!ehViolacaoUnicidade(error)) throw error;

    // Violação de índice parcial: o lote não diz QUAL linha bateu. Vai uma a uma.
    for (const row of lote) {
      const { error: errLinha } = await sb
        .from("movimentacoes_bancarias")
        .upsert([row], { onConflict: "hash_unico", ignoreDuplicates: true });
      if (!errLinha) {
        contagem.nova();
      } else if (ehViolacaoUnicidade(errLinha)) {
        contagem.duplicada();
      } else {
        throw errLinha;
      }
    }
  }
}

/** Uma linha só. Devolve true se entrou, false se era repetida. */
export async function inserirMovimentacao(
  sb: Client,
  row: Record<string, unknown>,
  contagem: ContagemImportacao
): Promise<boolean> {
  const antes = contagem.novas;
  await inserirMovimentacoes(sb, [row], contagem);
  return contagem.novas > antes;
}
