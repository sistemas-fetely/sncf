// CONCESSAO-QUE-NAO-TRANCA-E-MENTIRA (03/09/2026)
//
// Gate de servidor para edge function. Um botao escondido na UI nao e trava: a rota
// aceita POST direto. Aqui a permissao e avaliada no servidor, contra o Console de
// Acesso, antes de qualquer leitura de dado sensivel.
//
// UNIAO DE PORTAS de proposito: a mesma rota e chamada de telas diferentes por papeis
// diferentes. `nf-download` tem 8 pontos de chamada e so um tem gate nominal — os outros
// pegam carona no gate da ROTA. Exigir um slug unico quebraria Fila, Fiscal e Parceiros.
// Entao: passa quem tem QUALQUER uma das portas declaradas.
//
// DIMENSAO-VIA-TABELA: a porta de tabela usa `pode_ler_tabela`, que le o mapa
// `leitura_tabela_tela` no banco. Nao existe lista de slug hardcoded aqui.
//
// FAIL-CLOSED: erro ao avaliar a permissao NEGA. Nunca liberar por falha de RPC.

// deno-lint-ignore-file no-explicit-any

export class NaoAutorizado extends Error {
  readonly status = 403;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "NaoAutorizado";
  }
}

export interface Portas {
  /** Slugs de acao/tela avaliados por `tem_permissao`. */
  slugs?: string[];
  /** Tabelas avaliadas por `pode_ler_tabela` (le o mapa `leitura_tabela_tela`). */
  tabelas?: string[];
}

/**
 * Garante que o usuario tem ao menos UMA das portas. Lanca `NaoAutorizado` se nao tiver,
 * e lanca Error comum se a avaliacao falhar (fail-closed, nunca libera).
 */
export async function exigirPorta(
  sb: any,
  userId: string,
  portas: Portas,
  contexto: string,
): Promise<void> {
  if (!userId) throw new NaoAutorizado(`Sem usuario para autorizar: ${contexto}.`);

  for (const slug of portas.slugs ?? []) {
    const { data, error } = await sb.rpc("tem_permissao", { p_slug: slug, p_user: userId });
    if (error) {
      throw new Error(`Falha ao avaliar a permissao ${slug}: ${error.message}`);
    }
    if (data === true) {
      console.log(`[autorizacao] ${contexto}: liberado por slug ${slug}`, { user_id: userId });
      return;
    }
  }

  for (const tabela of portas.tabelas ?? []) {
    const { data, error } = await sb.rpc("pode_ler_tabela", { p_tabela: tabela, p_user: userId });
    if (error) {
      throw new Error(`Falha ao avaliar a leitura de ${tabela}: ${error.message}`);
    }
    if (data === true) {
      console.log(`[autorizacao] ${contexto}: liberado por leitura de ${tabela}`, { user_id: userId });
      return;
    }
  }

  const portasTexto = [...(portas.slugs ?? []), ...(portas.tabelas ?? [])].join(" ou ");
  console.warn(`[autorizacao] ${contexto}: NEGADO`, { user_id: userId, portas: portasTexto });
  throw new NaoAutorizado(
    `Sem permissao para ${contexto}. Requer: ${portasTexto}. Fale com quem administra os acessos.`,
  );
}
