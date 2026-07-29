## Investigação read-only concluída — sem mudanças propostas

Você pediu apenas o inventário. Não há alteração a planejar. Segue o resumo (detalhado na resposta anterior):

### Arquivos que chamam `liberar_pedido_estoque`

1. **`src/pages/vendas/TriagemEstoque.tsx:413`**
   - Rota: `/vendas/triagem-estoque` (Triagem de Estoque, SOPS/Vendas).
   - UI: linha da tabela, botão de ação por pedido nas abas "Pronto para enviar" / "Com parcela vencida". Rótulo vem de `vw_pedido_destino_estoque`. Grupo `negociar` abre AlertDialog; `enviar` dispara direto.

2. **`src/pages/Pedidos/PedidoDetalhe.tsx:644`** (componente `EnviarParaSeparacaoAcao`)
   - Rota: `/pedidos/:id` (Detalhe do Pedido, aberto a partir da Casa dos Pedidos).
   - UI: painel lateral "AÇÕES", botão inline abaixo da `AcaoPrimaria`. Renderiza SOMENTE quando `estagio === "aguardando_estoque"` (gate em `PedidoDetalhe.tsx:1934`). Mesma lógica de grupo `negociar`/`enviar`; mostra badge "Pago" e "falta recebível" quando aplicável.

### Auxiliar
- `src/lib/pedidoLiberacaoEstoque.ts` — helper `rotuloDestinoLiberacao(destino)`, consumido pelas duas telas.

### Resposta direta
Sim, o detalhe do pedido (`/pedidos/:id`) tem a ação "liberar do estoque / produto chegou" para pedidos em `aguardando_estoque`, no painel "AÇÕES" — é o mesmo botão de "Enviar para separação" da Triagem, condicionado ao estágio.

---

Como você pediu para não propor mudanças, este plano existe apenas para encerrar o modo Plan. Se quiser avançar (ex.: renomear o botão, mudar posicionamento, adicionar outro estágio), me diga o quê e eu monto um plano de execução.