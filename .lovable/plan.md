# Investigação: migração para `vw_pedido_situacao_financeira`

## TL;DR
A migração que você está pedindo **já está feita**. Verifiquei os arquivos e nenhuma tela SOPS deriva mais tag de pagamento a partir de `pedido_portao`. Oportunidades já renderiza `situacao_rotulo` + `alerta_operacional`. Não há alteração de código a fazer — resta validar em produção que os 16 pedidos citados não aparecem mais como "Pago".

## Respostas às perguntas

### 1. Lista e card de Pedidos B2B (SOPS) — onde a tag é calculada

- **Lista**: `src/components/pedidos/FilaPedidosPorArea.tsx`
  - Linha 159: filtro por `p.situacao_financeira` (fonte nova).
  - Linhas 659-660: componente `ValorComPagamento` lê `p.situacao_financeira` e `p.situacao_rotulo` — **não lê `pedido_portao`**.
- **KPIs**: `src/components/pedidos/PipelineHorizontal.tsx` linhas 81-87 consomem `vw_pedido_situacao_financeira` com filtro `situacao_financeira = 'vencido'`. Comentário no arquivo já diz explicitamente "Não usar pedido_portao para isto."
- **Card do pedido**: `src/pages/Pedidos/PedidoDetalhe.tsx` — não deriva tag de pagamento a partir de `pedido_portao` (portão aparece só nos painéis de comunicação/links, o que é correto).

### 2. Inventário de usos de `pedido_portao` no frontend

Todos os usos restantes são **gate de liberação**, não estado financeiro:
- `src/hooks/pedidos/usePedidoPortaoProvisorio.ts` — criação de portão provisório.
- `src/hooks/pedidos/useEnviarEmailPedidoCobranca.ts:58` — busca link de pagamento do portão para o e-mail (correto: antes do 1º título existir, o link vive no portão).
- `src/hooks/credito/usePrimeiroPagamentoFila.ts:27` — fila do 1º pagamento (é a razão de existir do portão).
- `src/components/pedidos/PortaoLinksPanel.tsx:76` — painel de gestão dos links do portão.
- `src/components/pedidos/ComunicacaoPedidoPanel.tsx:74` — painel de comunicação (usa link do portão).
- `src/components/pedidos/PipelineHorizontal.tsx:82` — apenas em comentário explicando por que não usa.
- `src/types/pedido.ts` e `src/integrations/supabase/types.ts` — tipos.

Nenhum deles renderiza tag de "Pago/Pendente" no card ou na lista. OK.

### 3. Hook React Query que busca os pedidos

`src/hooks/pedidos/usePedidosFila.ts` — linhas 42-65 já fazem o batch fetch em `vw_pedido_situacao_financeira` e merge dos campos `situacao_financeira`, `situacao_rotulo`, `valor_pago`, `valor_aberto`, `valor_vencido`, `dias_atraso_max`, `delta_pedido_titulo` em cada `PedidoFilaItem`.

### 4. Oportunidades — coluna "Já pagou"

`src/pages/Comercial/Oportunidades.tsx`:
- Linhas 59-61 tipam `situacao_financeira`, `situacao_rotulo`, `alerta_operacional` vindos de `vw_oportunidades_comercial`.
- Linhas 293-305 já renderizam `situacao_rotulo` como badge principal e `alerta_operacional` como badge secundário quando presente.

Ou seja, a troca que você quer **já está aplicada**.

## Plano de ação

Nada a alterar em código. Restam duas validações operacionais que **você** faz, não eu:

1. Abrir a Casa dos Pedidos em produção e confirmar que os 16 pedidos com R$ 45.009,14 em aberto agora aparecem como "Vencido"/"Parcial"/"Em aberto" — não mais "Pago".
2. Abrir Oportunidades e confirmar que a coluna Situação mostra `situacao_rotulo` + badge de `alerta_operacional` conforme esperado.

Se algum dos dois pontos falhar, me diga qual pedido e qual rótulo aparece — aí sim faz sentido reabrir o código.

## Faltando no banco?
Nada identificado. `vw_pedido_situacao_financeira` cobre todos os campos consumidos e `vw_oportunidades_comercial` já expõe `alerta_operacional`.