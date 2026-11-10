import { supabase } from "@/integrations/supabase/client";

export interface ProdutoRetorno {
  sku: string;
  cod: string | null;
  nome: string | null;
  dun?: string;
  innerQtd?: number | null;
}

/** The return scanner resolves here, preserving EAN/code/SKU precedence. */
export async function resolverCodigoRetorno(codigo: string, sb = supabase): Promise<ProdutoRetorno | null> {
  const campos = "sku,ean,dun,cod_cadastro,nome_comercial";
  for (const campo of ["ean", "cod_cadastro", "sku", "dun"] as const) {
    const consulta = sb.from("sncf_produtos").select(campos);
    const esc = codigo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
    const { data, error } = await (campo === "sku" ? consulta.ilike(campo, esc) : consulta.eq(campo, codigo)).limit(1);
    if (error) throw error;
    const produto = data?.[0];
    if (!produto?.sku) continue;
    const base = { sku: produto.sku, cod: produto.cod_cadastro, nome: produto.nome_comercial };
    if (campo !== "dun") return base;
    // vw_codigo_barras joins by SKU, not DUN; it cannot supply this rule.
    const cartorio = await sb.from("cartorio_codigo").select("inner_qtd").eq("dun", produto.dun ?? codigo).maybeSingle();
    if (cartorio.error) throw cartorio.error;
    return { ...base, dun: produto.dun ?? codigo, innerQtd: cartorio.data?.inner_qtd ?? null };
  }
  return null;
}

/** Null means an explicit total of units is required before adding anything. */
export function unidadesBipeRetorno(produto: ProdutoRetorno, qtd: number): number | null {
  if (!produto.dun) return qtd;
  const inner = produto.innerQtd;
  return inner != null && Number.isFinite(inner) && inner > 1 ? inner * qtd : null;
}

export function origemDunRetorno(produto: ProdutoRetorno): string | undefined {
  if (!produto.dun) return undefined;
  return produto.innerQtd != null && produto.innerQtd > 1
    ? `DUN · 1 cx = ${produto.innerQtd} un`
    : "DUN · unidades informadas";
}