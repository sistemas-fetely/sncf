# Identificação humana nos Pedidos de Mercadoria

Trocar a identificação da lista "Pedidos existentes" (aba Acompanhamento de `/logistica/chegada-mercadoria`, em `src/pages/logistica/CadastroPedidoCompra.tsx`) pelo rótulo pronto da view `vw_compra_pedido_identidade`. Só frontend — nenhuma mudança de banco.

## Confirmações feitas
- A view existe e retorna: `pedido_id`, `identificacao`, `competencia`, `base_da_competencia`, `data_chegada_precisao`, `numero_pedido`, `categorias`, `categoria_mista`, `status`, `numero_proforma`, `numero_invoice`, `numero_packing_list`, `processo_ref`, `busca` (confirmado por query real).
- Hoje a lista usa `vw_importacao_pedido_detalhe` e **não tem campo de busca** — será adicionado via prop `busca` do `TabelaFetely`.

## Mudanças (arquivo: `src/pages/logistica/CadastroPedidoCompra.tsx`)

1. **Nova query** `useQuery` lendo `vw_compra_pedido_identidade` com os campos acima, montando um `Map` por `pedido_id` (mesmo padrão de `saldoPorPedido`). Nada é recalculado no front.

2. **Coluna "Número"**: mostra `competencia` como prefixo discreto (`text-xs text-muted-foreground`) com ícone de informação e tooltip; o `numero_pedido` em destaque (`font-medium`); abaixo, `categorias` + `status` como texto secundário. Tooltip por `base_da_competencia`:
   - chegada → "Competência pela data de chegada da mercadoria"
   - termo → "Competência pela data do termo de conferência (chegada não informada)"
   - eta → "Competência pela ETA prevista"
   - pedido → "Competência pela data do pedido (ainda não chegou)"
   - se `data_chegada_precisao === 'mes'`, acrescenta "· mês aproximado".
   - Se `categoria_mista`, um marcador leve (ex.: selo "mista" ou ícone) junto das categorias.
   - Fallback: pedido sem linha na view mantém o `numero_pedido` cru.

3. **Coluna "Ref."** vira "Referências": lista empilhada de `numero_proforma` (Proforma), `numero_invoice` (Invoice), `numero_packing_list` (PL) e `processo_ref` (Processo), cada um com rótulo curto em `text-xs`; só os não nulos; todos nulos → "—". `rocabella_ref` sai dessa coluna.

4. **Busca**: estado local + prop `busca` do `TabelaFetely` (placeholder ex.: "Buscar por número, proforma, invoice, PL, processo ou categoria…"). Filtro case-insensitive por conteúdo parcial sobre o campo `busca` da view.

5. **Ordenação padrão**: `competencia` decrescente, desempate por `numero_pedido`, em `pedidosOrdenados` (substitui a ordenação atual por `data_pedido`).

6. Demais colunas (Linhas, Custo FOB, Fase XPM, Andamento, A faturar, A confirmar, Atraso, Pendências, datas) inalteradas.

## Verificação
- Type-check (`bunx tsc --noEmit`).
- Conferência visual via Playwright na aba Acompanhamento: novo formato do Número, tooltip da competência, referências e busca funcionando (ex.: digitar "D003" encontra o pedido).
