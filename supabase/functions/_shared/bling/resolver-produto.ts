// RESOLUÇÃO DO PRODUTO DO BLING — uma função só (22/09/2026, pedido #1336).
//
// Antes cada envio subia três degraus por conta própria (card canônico → espelho →
// API) e resolvia pela STRING do código. No #1336 o Shopify mandou `01883`
// (cod_cadastro) no lugar do SKU; no Bling havia dois cards para o mesmo produto —
// `TALGARGRDVER.LA/01883` ATIVO e `01883` INATIVO — e a resolução pela string caía no
// inativo. O Bling recusou três vezes com "Produto não encontrado, id inválido".
//
// Agora quem decide é a RPC `fn_bling_resolver_produto(p_codigo)`:
//   cod_cadastro → SKU → espelho, e NUNCA devolve card inativo.
// Este módulo só CHAMA a RPC. A API do Bling continua existindo nos consumidores,
// mas só como ÚLTIMO recurso, quando a RPC não acha card nenhum para o código.

export type ResolucaoProdutoBling = {
  ok: boolean;
  codigo?: string;
  bling_id?: string;
  sku?: string;
  /** Degrau que resolveu: cod_cadastro | sku | espelho. */
  como?: string;
  card_inativo?: boolean;
  motivo?: string;
};

export async function resolverProdutoBling(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  codigo: string,
): Promise<ResolucaoProdutoBling> {
  const { data, error } = await supabase.rpc("fn_bling_resolver_produto", {
    p_codigo: String(codigo ?? "").trim(),
  });
  if (error) {
    throw new Error(`fn_bling_resolver_produto(${codigo}): ${error.message}`);
  }
  if (!data || typeof data !== "object") {
    return { ok: false, codigo, motivo: "fn_bling_resolver_produto não devolveu resposta" };
  }
  return data as ResolucaoProdutoBling;
}
