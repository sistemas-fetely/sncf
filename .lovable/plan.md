# Plano — Fonte única de estado financeiro do pedido

## Diagnóstico confirmado (leitura do código)

Hoje, na fila SOPS (`/pedidos`), a tag "Pago / Vencido / Sem cobrança" é decidida por `p.pagamento_status`, coluna que já vem pré-computada da view `v_pedidos_fila` — o frontend **não** lê `pedido_portao` diretamente para pintar essa tag. Ou seja, a "verdade" atual está no servidor, dentro de `v_pedidos_fila`, e é ela que precisa parar de ser consultada para efeito de estado financeiro na UI.

Inventário de leitura de `pedido_portao` no frontend (nenhum deles vira "tag de pago" — todos são gate de liberação / links de pagamento e devem continuar como estão):

- `src/components/pedidos/ComunicacaoPedidoPanel.tsx:74` — boleto de entrada.
- `src/components/pedidos/PortaoLinksPanel.tsx:76` — painel de links no detalhe do pedido.
- `src/hooks/credito/usePrimeiroPagamentoFila.ts:27` — fila do 1º pagamento (Crédito).
- `src/hooks/pedidos/useEnviarEmailPedidoCobranca.ts:39` — fallback de link em email.
- `src/hooks/pedidos/usePedidoPortaoProvisorio.ts:9` — boolean "tem portão provisório".

Estes ficam intactos (doutrina CASA-LIMITE).

Pontos onde `pagamento_status` derivado do portão é consumido e precisa migrar:

- `src/components/pedidos/FilaPedidosPorArea.tsx:157-163` — dropdown de filtro por status de pagamento.
- `src/components/pedidos/FilaPedidosPorArea.tsx:426` + componente `ValorComPagamento` (`:656-770`) — tag na linha.
- `src/components/pedidos/PipelineHorizontal.tsx:85` — KPI "vencidos" no pipeline.
- `src/pages/Comercial/Oportunidades.tsx:55, 221, 289-297` — coluna "Já pagou" hoje mostra `valor_pago` em R$, sem badge de estado; `status_portao` está tipado mas não renderizado.

## O que muda em cada arquivo

### 1. `src/hooks/pedidos/usePedidosFila.ts`
Sem alterar a consulta principal a `v_pedidos_fila`. Adicionar uma **query auxiliar** (mesmo padrão já usado em `FilaPedidosPorArea` para `analiseStages` e `aguardandoEstoqueMap`): buscar `vw_pedido_situacao_financeira` filtrado pelos `pedido_id` da página, retornar `Map<pedido_id, { situacao_financeira, situacao_rotulo, valor_pago, valor_aberto, valor_vencido, dias_atraso_max, delta_pedido_titulo }>`.

Alternativa (a decidir com o usuário): manter a busca dentro do próprio `usePedidosFila` e devolver os campos já mesclados em cada item da fila. Mais simples de consumir; custo é acoplar o hook à view nova. Recomendo esta.

### 2. `src/types/pedido.ts`
Adicionar em `PedidoFilaItem` os campos vindos da view nova: `situacao_financeira`, `situacao_rotulo`, `valor_aberto`, `delta_pedido_titulo` (os demais — `valor_pago`, `valor_vencido`, `dias_atraso_max` — já existem, agora passam a vir da view nova). Manter `pagamento_status` no tipo por enquanto (ainda usado por Pipeline; ver item 4).

### 3. `src/components/pedidos/FilaPedidosPorArea.tsx`
- `ValorComPagamento` (`:656-770`): trocar o switch por `situacao_financeira` da view nova. Mapeamento:
  - `vencido` → badge vermelho, texto `situacao_rotulo` + "{dias_atraso_max}d".
  - `quitado` → badge verde, texto `situacao_rotulo` ("Quitado").
  - `parcial_pago` → sem badge forte, tooltip "R$ X já pago · R$ Y em aberto" (usa `valor_pago` e `valor_aberto`).
  - `sem_recebivel` → badge âmbar "Sem cobrança/recebível".
  - `anulado` → badge cinza "Anulado".
  - `em_aberto` → sem badge, valor limpo.
  - Fallback: se a view não devolver linha (pedido sem título), renderiza como `em_aberto`.
- Dropdown de filtro (`:157-163`): trocar as chaves comparadas para os valores novos (`vencido`, `parcial_pago`, `quitado`, `sem_recebivel`). Como o merge é client-side, o filtro passa a ser aplicado em memória sobre `situacao_financeira` — coerente com o resto do pipeline de filtros (busca, marcação) já client-side.

### 4. `src/components/pedidos/PipelineHorizontal.tsx:85`
KPI "vencidos" ainda consulta `pagamento_status="vencido"` direto no banco. Para não ficar com duas verdades, trocar para `.eq("situacao_financeira","vencido")` contra `vw_pedido_situacao_financeira` (ou a view/tabela que a exponha via join com pedidos). **Ponto para confirmar com o usuário**: essa view por pedido comporta ser consultada por estágio + área da mesma forma? Se não, sinalizo para deixar o KPI de fora do escopo desta rodada.

### 5. `src/pages/Comercial/Oportunidades.tsx`
- Renomear a coluna "Já pagou" para **"Situação"**.
- Substituir o conteúdo da célula (`:289-297`) por `situacao_rotulo` (texto pronto) + badge secundário quando `alerta_operacional` estiver preenchido (a coluna já existe em `vw_oportunidades_comercial`). Cor do badge de alerta: âmbar (padrão de aviso operacional já usado na tela).
- Ampliar `OportunidadeRow` (`:38-70`) para incluir `situacao_financeira`, `situacao_rotulo`, `alerta_operacional`. Remover `status_portao` do tipo — está morto (não é renderizado em lugar nenhum).
- Ordenação/filtros da tabela não mudam.

## Fora de escopo (a confirmar antes de mexer)

- Nada no banco: sem migration, sem alterar `v_pedidos_fila`, sem RPC.
- `pedido_portao` continua sendo lido pelos 5 pontos listados no diagnóstico — são gate de liberação, não estado financeiro. Não tocar.
- Detalhe do pedido (`PedidoDetalhe`) não está no escopo desta mensagem — se houver tag de pagamento lá derivada de portão, aviso e trato em separado.

## Perguntas antes de executar

1. Confirma que o merge da view nova deve entrar dentro de `usePedidosFila` (fila devolve tudo pronto), ou prefere query auxiliar isolada dentro do componente da fila?
2. O KPI de "vencidos" em `PipelineHorizontal` entra nesta rodada ou fica para depois?
3. A `vw_pedido_situacao_financeira` responde bem a um `IN (pedido_id...)` com ~500 ids (limite atual do hook), ou precisa de outro shape de consulta?
