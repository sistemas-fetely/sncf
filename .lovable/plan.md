# Investigação read-only — autenticação Shopify Admin API

Você pediu investigação, não alteração. Nada será modificado. Segue o resumo dos achados; o detalhamento com trechos de código já foi entregue na mensagem do chat.

## Padrão de autenticação atual (reutilizável no pull de catálogo)

Ambas as edge functions (`sincronizar-estoque-shopify`, `shopify-pagamento-sync`) usam exatamente o mesmo caminho:

1. **Segredos no vault Postgres**, lidos via RPC `get_vault_secret(p_name)`:
   - `SHOPIFY_CLIENT_ID`
   - `SHOPIFY_CLIENT_SECRET`
   - `SHOPIFY_STORE_DOMAIN` (opcional; se ausente, fallback para `["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"]`)

2. **Troca OAuth `client_credentials`** contra `https://{domain}/admin/oauth/access_token`. **Não** há `shpat_...` armazenado — o access token é minted a cada invocação.

3. **GraphQL Admin API versão `2026-04`** em `https://{domain}/admin/api/2026-04/graphql.json`, header `X-Shopify-Access-Token`.

4. `shopify-pagamento-sync` acrescenta guard `x-cron-secret` (compara com `SYNC_CRON_SECRET` do vault).

## O que NÃO existe hoje (você terá que criar se o pull de catálogo precisar)

- **Paginação por cursor** (`pageInfo.endCursor` / `hasNextPage` no GraphQL, ou `page_info` do REST). Nenhuma das duas funções lê listas grandes.
- **Rate limit / retry**. Nenhum backoff, nenhuma leitura de `extensions.cost.throttleStatus`, nenhum tratamento de HTTP 429.

## Próximo passo sugerido

Quando quiser avançar para o pull de catálogo, me diga:
- REST Admin (`/products.json` com `Link` header + `page_info`) ou GraphQL (`products(first, after)` com `pageInfo`)?
- Escopo: catálogo completo, delta por `updated_at`, ou por conjunto de SKUs?

Aí eu volto com um plano concreto de implementação reusando `getSecret` + `exchangeToken` + `gql`.
