# Bipe GTIN normalizado

Resolver único: `src/lib/estoque/resolverCodigoBarras.ts` (`normalizarGtin`, `montarIndiceBarras`, `resolverCodigoBarras`, `unidadesCodigoBarras`).

Base: a conferência da Mesa SP já tratava UPC/EAN ignorando zeros à esquerda. Agora EAN e DUN numéricos com até 14 dígitos são comparados como GTIN-14. Código de cadastro continua exato; SKU literal sem distinção entre maiúsculas/minúsculas. Precedência: EAN → código → SKU → DUN.

`useResolverCodigoBarras` carrega produtos/cartório com paginação estável e cache compartilhado. Os índices de comparação são mapas em memória; não há busca SQL por expressão nem consulta por bipe, portanto não é necessário índice novo no banco. Inner é associado por DUN normalizado, nunca por SKU, múltiplo comercial ou kit. Inner >= 1 multiplica diretamente pela Qtd, inclusive inner = 1 (uma unidade por caixa). Só inner nulo ou <= 0 requer total explícito de unidades. A origem na devolução mostra "DUN · 1 cx = N un" para todo inner válido.

## Telas migradas e resolução anterior

| Tela | Antes | Agora |
|---|---|---|
| Devoluções: contagem cega | cache local exato + consultas EAN/cód/SKU/DUN exatas (SKU ilike) | índice compartilhado; adaptador `codigoRetorno` apenas conserva formato/status |
| Mesa SP: conferência dos itens | EAN/SKU/cód do pedido em OR, removendo zeros numéricos; 1 unidade por bipe | resolver compartilhado + pertinência ao pedido; caixas em unidades |
| Recebimento de transferência | `LeitorCodigoBarras`: view `vw_codigo_barras`, só dígitos sem zeros + fallback de cadastro | mesmo leitor, agora usando resolver compartilhado |
| Transferência interna: leitura/criação | mesmo leitor via view e fallback | resolver compartilhado |
| Inventário: contagem por centro | mesmo leitor via view e fallback | resolver compartilhado |
| Inventário: importar contagem | variantes 8/12/13/14, view + SKU + cód com padding | mesmo índice e precedência; caixa desconhecida pede correção da linha para unidades |
| Transferência: inclusão por bipe no seletor | substring EAN + comparação sem zeros | resolver compartilhado; busca descritiva permanece separada |

A estação Separação da Mesa SP é uma lista de picking: o bipe acontece na Conferência. A tela de expedições XPM não possui outro resolver de produtos. Bipes de rastreio Correios, documentos e códigos de pedidos não são GTIN e permanecem intactos.

## Verificação

Na validação original de GTIN, DEV-B2C-1455 no preview autenticado aceitou `631911283369` e `0631911283369` como 01833 e recusou código inexistente sem alterar a contagem. A decisão do Flávio em 10/11/2026 substitui a regra anterior para inner=1: `10631911283366` agora conta diretamente Qtd unidades, sem abrir pedido de unidades. Nenhum retorno ou despacho registrado.