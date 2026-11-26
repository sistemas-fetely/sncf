import { describe, expect, it, vi } from "vitest";
import { colecoesFaltantes, garantirColecoesCadastro, lerColecoesCadastro, normColecao, type ColecaoCriada } from "../../../supabase/functions/_shared/shopify/colecoes-cadastro.ts";
import type { ShopifyAdmin } from "../../../supabase/functions/_shared/shopify/admin-client.ts";

const resposta = (data: unknown) => ({ status: 200, data, body: { data }, errors: null });
const lista = (nodes = [{ id: "todos", title: "Todos os produtos" }]) => resposta({ collections: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } });
const canais = () => resposta({ collection: { resourcePublications: { nodes: [
  { isPublished: true, publication: { id: "canal-1" } },
  { isPublished: false, publication: { id: "canal-2" } },
], pageInfo: { hasNextPage: false, endCursor: null } } } });
const cliente = (gql: ReturnType<typeof vi.fn>) => ({ domain: "teste", gql }) as ShopifyAdmin;

describe("coleções automáticas de cadastro Shopify", () => {
  it("prévia de faltantes deduplica por norm sem escrever", () => {
    const mapa = new Map([[normColecao("Todos os produtos"), "todos"]]);
    expect(colecoesFaltantes(["Todos os produtos", "Jingle Pop", "Jíngle-Pop", "Pratos"], mapa)).toEqual(["Jingle Pop", "Pratos"]);
  });
  it("relê e não recria uma coleção feita por outra leva", async () => {
    const gql = vi.fn().mockResolvedValue(lista([{ id: "jingle", title: "Jingle Pop" }]));
    const criadas: ColecaoCriada[] = [];
    const r = await garantirColecoesCadastro(cliente(gql), ["Jingle Pop"], criadas);
    expect(gql).toHaveBeenCalledTimes(1);
    expect(r.mapa.get(normColecao("Jingle Pop"))).toBe("jingle");
    expect(criadas).toEqual([]);
  });
  it("cria uma manual por norm com título exato e BEST_SELLING e publica nos canais da referência", async () => {
    const gql = vi.fn().mockResolvedValueOnce(lista()).mockResolvedValueOnce(canais())
      .mockResolvedValueOnce(resposta({ collectionCreate: { collection: { id: "novo", title: "Jíngle Pop" }, userErrors: [] } }))
      .mockResolvedValueOnce(resposta({ publishablePublish: { userErrors: [] } }));
    const criadas: ColecaoCriada[] = [];
    const r = await garantirColecoesCadastro(cliente(gql), ["Jíngle Pop", "Jingle-Pop"], criadas);
    expect(gql).toHaveBeenCalledTimes(4);
    expect(gql.mock.calls[2][1]).toEqual({ input: { title: "Jíngle Pop", sortOrder: "BEST_SELLING" } });
    expect(gql.mock.calls[2][1].input).not.toHaveProperty("ruleSet");
    expect(gql.mock.calls[3][1]).toEqual({ id: "novo", input: [{ publicationId: "canal-1" }] });
    expect(r.mapa.get(normColecao("Jíngle Pop"))).toBe("novo");
    expect(criadas).toEqual([{ id: "novo", titulo: "Jíngle Pop" }]);
  });
  it("falha de criação isola a coleção recusada e segue nas demais", async () => {
    const gql = vi.fn().mockResolvedValueOnce(lista()).mockResolvedValueOnce(canais())
      .mockResolvedValueOnce(resposta({ collectionCreate: { collection: null, userErrors: [{ message: "Título recusado" }] } }))
      .mockResolvedValueOnce(resposta({ collectionCreate: { collection: { id: "pratos", title: "Pratos" }, userErrors: [] } }))
      .mockResolvedValueOnce(resposta({ publishablePublish: { userErrors: [] } }));
    const r = await garantirColecoesCadastro(cliente(gql), ["Jingle Pop", "Pratos"], []);
    expect(r.erros.get(normColecao("Jingle Pop"))).toContain("Título recusado");
    expect(r.mapa.has(normColecao("Jingle Pop"))).toBe(false);
    expect(r.mapa.get(normColecao("Pratos"))).toBe("pratos");
  });
  it("falha somente de publicação preserva a coleção criada com aviso e escopo ausente", async () => {
    const gql = vi.fn().mockResolvedValueOnce(lista()).mockResolvedValueOnce(canais())
      .mockResolvedValueOnce(resposta({ collectionCreate: { collection: { id: "novo", title: "Jingle Pop" }, userErrors: [] } }))
      .mockResolvedValueOnce({ status: 200, data: null, body: {}, errors: [{ message: "Access denied: write_publications" }] });
    const criadas: ColecaoCriada[] = [];
    const r = await garantirColecoesCadastro(cliente(gql), ["Jingle Pop"], criadas);
    expect(r.erros.size).toBe(0);
    expect(r.mapa.get(normColecao("Jingle Pop"))).toBe("novo");
    expect(r.avisos.get(normColecao("Jingle Pop"))).toContain("coleção Jingle Pop criada mas não publicada:");
    expect(criadas[0].aviso).toContain("write_publications");
  });
  it("paginação completa evita criar coleção que já existe na segunda página", async () => {
    const gql = vi.fn().mockResolvedValueOnce(resposta({ collections: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "p2" } } }))
      .mockResolvedValueOnce(lista([{ id: "jingle", title: "Jingle Pop" }]));
    expect((await lerColecoesCadastro(cliente(gql))).get(normColecao("Jingle Pop"))).toBe("jingle");
    expect(gql.mock.calls[1][1]).toEqual({ after: "p2" });
  });
  it("paginação incompleta falha sem criar", async () => {
    const gql = vi.fn().mockResolvedValue(resposta({ collections: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }));
    await expect(garantirColecoesCadastro(cliente(gql), ["Jingle Pop"], [])).rejects.toThrow("Paginação incompleta");
    expect(gql).toHaveBeenCalledTimes(1);
  });
});