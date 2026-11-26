import type { ShopifyAdmin, GqlResposta } from "./admin-client.ts";

export const normColecao = (s: unknown) => String(s ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Colecao = { id: string; title: string };
type Pagina<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Publicacao = { isPublished: boolean; publication: { id: string } };
const Q_COLECOES = `query($after: String) { collections(first: 250, after: $after) {
  nodes { id title } pageInfo { hasNextPage endCursor }
} }`;
const Q_PUBLICACOES = `query($id: ID!, $after: String) { collection(id: $id) {
  resourcePublications(first: 250, after: $after, onlyPublished: true) {
    nodes { isPublished publication { id } } pageInfo { hasNextPage endCursor }
  }
} }`;
const M_CRIAR = `mutation($input: CollectionInput!) { collectionCreate(input: $input) {
  collection { id title } userErrors { field message }
} }`;
const M_PUBLICAR = `mutation($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`;

function erroResposta(r: GqlResposta<unknown>, erros?: { message: string }[]): string {
  return JSON.stringify(r.errors?.length ? r.errors : erros?.length ? erros : r.body);
}

export async function lerColecoesCadastro(shop: ShopifyAdmin): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  let after: string | null = null;
  const cursores = new Set<string>();
  do {
    const r: GqlResposta<{ collections: Pagina<Colecao> }> = await shop.gql(Q_COLECOES, { after });
    if (r.status !== 200 || r.errors?.length || !r.data?.collections) {
      throw new Error(`leitura de coleções falhou: ${erroResposta(r)}`);
    }
    for (const c of r.data.collections.nodes) {
      const chave = normColecao(c.title);
      if (chave && !mapa.has(chave)) mapa.set(chave, c.id);
    }
    const pagina: Pagina<Colecao>["pageInfo"] = r.data.collections.pageInfo;
    if (!pagina.hasNextPage) break;
    if (!pagina.endCursor || cursores.has(pagina.endCursor)) throw new Error("Paginação incompleta das coleções Shopify");
    after = pagina.endCursor;
    cursores.add(pagina.endCursor);
  } while (true);
  return mapa;
}

export function colecoesFaltantes(titulos: string[], mapa: Map<string, string>): string[] {
  const vistos = new Set<string>();
  return titulos.filter((titulo) => {
    const chave = normColecao(titulo);
    if (mapa.has(chave) || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

async function publicacoesReferencia(shop: ShopifyAdmin, mapa: Map<string, string>): Promise<string[]> {
  const id = mapa.get(normColecao("Todos os produtos"));
  if (!id) throw new Error('Coleção "Todos os produtos" não encontrada para copiar canais de publicação');
  const ids = new Set<string>();
  const cursores = new Set<string>();
  let after: string | null = null;
  do {
    const r: GqlResposta<{ collection: { resourcePublications: Pagina<Publicacao> } }> = await shop.gql(Q_PUBLICACOES, { id, after });
    if (r.status !== 200 || r.errors?.length || !r.data?.collection?.resourcePublications) {
      throw new Error(`leitura dos canais de publicação falhou (requer read_publications): ${erroResposta(r)}`);
    }
    const pagina: Pagina<Publicacao> = r.data.collection.resourcePublications;
    for (const n of pagina.nodes) if (n.isPublished) ids.add(n.publication.id);
    if (!pagina.pageInfo.hasNextPage) break;
    if (!pagina.pageInfo.endCursor || cursores.has(pagina.pageInfo.endCursor)) throw new Error("Paginação incompleta dos canais de publicação");
    after = pagina.pageInfo.endCursor;
    cursores.add(pagina.pageInfo.endCursor);
  } while (true);
  return [...ids];
}

export interface ColecaoCriada { id: string; titulo: string; aviso?: string }

/** Relê antes de criar; deduplica por norm e nunca altera coleções existentes. */
export async function garantirColecoesCadastro(
  shop: ShopifyAdmin,
  titulos: string[],
  criadas: ColecaoCriada[],
): Promise<{ mapa: Map<string, string>; erros: Map<string, string>; avisos: Map<string, string> }> {
  const mapa = await lerColecoesCadastro(shop);
  const erros = new Map<string, string>();
  const avisos = new Map<string, string>();
  const faltantes = colecoesFaltantes(titulos, mapa);
  if (!faltantes.length) return { mapa, erros, avisos };
  let canais: string[] = [];
  let erroCanais: string | null = null;
  try { canais = await publicacoesReferencia(shop, mapa); }
  catch (e) { erroCanais = e instanceof Error ? e.message : String(e); }
  for (const titulo of faltantes) {
    const chave = normColecao(titulo);
    let criada: ColecaoCriada;
    try {
      const r = await shop.gql<{ collectionCreate: { collection: Colecao | null; userErrors: { message: string }[] } }>(M_CRIAR, {
        input: { title: titulo, sortOrder: "BEST_SELLING" },
      });
      const resultado = r.data?.collectionCreate;
      if (r.status !== 200 || r.errors?.length || resultado?.userErrors.length || !resultado?.collection?.id) {
        throw new Error(`collectionCreate (requer write_products): ${erroResposta(r, resultado?.userErrors)}`);
      }
      criada = { id: resultado.collection.id, titulo };
      criadas.push(criada);
      mapa.set(chave, criada.id);
    } catch (e) {
      erros.set(chave, e instanceof Error ? e.message : String(e));
      continue;
    }
    try {
      if (erroCanais) throw new Error(erroCanais);
      if (canais.length) {
        const r = await shop.gql<{ publishablePublish: { userErrors: { message: string }[] } }>(M_PUBLICAR, {
          id: criada.id, input: canais.map((publicationId) => ({ publicationId })),
        });
        const resultado = r.data?.publishablePublish;
        if (r.status !== 200 || r.errors?.length || !resultado || resultado.userErrors.length) {
          throw new Error(`publishablePublish (requer write_publications): ${erroResposta(r, resultado?.userErrors)}`);
        }
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      criada.aviso = `coleção ${titulo} criada mas não publicada: ${mensagem}`;
      avisos.set(chave, criada.aviso);
    }
  }
  return { mapa, erros, avisos };
}