## Já está feito

Essa migração foi executada em turno anterior. Verifiquei os arquivos que o pedido nomeia e todos já apontam para `vw_pedido_situacao_financeira`. Não há trabalho novo a planejar — abaixo está o inventário do estado atual, para você confirmar.

### 1. Tela de Pedidos B2B (SOPS) — tag de pagamento

- `src/hooks/pedidos/usePedidosFila.ts` (linhas 42–65): o hook `usePedidosFila` busca `v_pedidos_fila` e, no mesmo fetch, faz um segundo `select` em `vw_pedido_situacao_financeira` com `.in("pedido_id", …)` sobre a página atual, dando merge de `situacao_financeira`, `situacao_rotulo`, `valor_pago`, `valor_aberto`, `valor_vencido`, `dias_atraso_max` e `delta_pedido_titulo` no item da fila.
- `src/types/pedido.ts` (linhas 143–146): `PedidoFilaItem` já expõe `situacao_financeira` (tipo `SituacaoFinanceira`) e `situacao_rotulo`.
- `src/components/pedidos/FilaPedidosPorArea.tsx` (linha 159 e linhas 659–660): o `ValorComPagamento` decide a cor da tag com base em `situacao_financeira` (quitado → verde, parcial_pago → azul, vencido → vermelho, sem_recebivel → âmbar, em_aberto → neutro) e renderiza `situacao_rotulo`. O filtro "Situação" na fila também opera sobre essas strings.
- `src/components/pedidos/PipelineHorizontal.tsx` (linhas 81–87): o KPI "vencidos" agora conta em `vw_pedido_situacao_financeira` filtrando `situacao_financeira = 'vencido'`, sem mais tocar em `pedido_portao`.

### 2. Leituras remanescentes de `pedido_portao` no frontend

Todas são de gate de liberação / links, não de estado financeiro. Nenhuma precisa mudar por esta doutrina:

- `src/components/pedidos/PortaoLinksPanel.tsx` — links do portão (WhatsApp, boleto, PIX).
- `src/components/pedidos/ComunicacaoPedidoPanel.tsx` — status do portão para painel de comunicação.
- `src/hooks/pedidos/usePedidoPortaoProvisorio.ts` — cria/lê portão provisório.
- `src/hooks/pedidos/useEnviarEmailPedidoCobranca.ts` — decide envio a partir do portão.
- `src/hooks/credito/usePrimeiroPagamentoFila.ts` — fila do primeiro pagamento (gate).

### 3. Hook de listagem

`src/hooks/pedidos/usePedidosFila.ts` continua sendo o hook único da fila SOPS. É lá que o merge da view nova entra — e já entrou.

### 4. Oportunidades (Comercial)

`src/pages/Comercial/Oportunidades.tsx` (linhas 59–60 e 293–295) já lê `situacao_financeira` e `situacao_rotulo` de `vw_oportunidades_comercial` e renderiza `situacao_rotulo` na coluna, no lugar de "Já pagou". O badge com `alerta_operacional` também está no arquivo.

### Ponto a confirmar

Se você reverteu localmente ou está pedindo esta investigação porque a UI ainda mostra "Pago" indevidamente em produção, o problema não é código — é build/publish. Nesse caso me diga que quer verificar em produção (rodar Playwright na URL publicada) em vez de replanejar a migração. Se, por outro lado, você quer uma segunda passada procurando pontos que escaparam (algum outro componente listando pedidos ou algum badge fora da fila), me diga onde suspeita — faço a varredura direcionada.

## Arquivos que seriam tocados

Nenhum. A migração já está aplicada e o typecheck passou na última rodada.
