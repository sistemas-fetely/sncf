# CONTA DO CLIENTE — F1c (telas)

Somente UI. Nenhuma migration, nenhum SQL de schema, nenhuma RLS. O portão/pagamento
existente fica intacto (corte limpo).

## Decisões que preciso confirmar (assumo o seguinte se não houver objeção)

1. **Rota**: as telas de Finanças vivem sob `/administrativo/*` (`FinancasLayout`), não
   `/financas/*`. Vou usar `/administrativo/conta-cliente` para não criar um segundo
   prefixo de pilar.
2. **Menu**: a navegação é MENU-VIA-TABELA (`sncf_navegacao`). Para o item aparecer é
   preciso **uma linha de dados** nessa tabela (não é schema, não é RLS):
   `chave: fin.conta_cliente`, `pai_chave: fin.receitas`, `label: Conta do Cliente`,
   `icone: Users`, `ordem: 15`, `rota: /administrativo/conta-cliente`,
   `tela_slug: tela.fin_receber` (reaproveita quem já vê Recebíveis).
   Se preferir que eu não insira nada no banco, digo e a tela fica acessível só por URL.
3. **Card no pedido**: `PedidoDetalhe.tsx` não tem aba "Pagamento"; a área de pagamento é
   a coluna lateral onde ficam `LinkPagamentoCard` e `ComunicacaoPedidoPanel`. O bloco
   "Cobertura do cliente" entra ali, logo acima do `LinkPagamentoCard`.

## Arquivos que vou tocar

### Novos — dados
- `src/hooks/financeiro/useContaCliente.ts`
  - `useContasClienteSaldo()` — `vw_conta_cliente_saldo`, ordenação por `|saldo|` desc no cliente.
  - `useContaClienteLancamentos(parceiroId)` — `vw_conta_cliente_lancamentos`, data desc.
  - `useContaClienteFuros(parceiroId)` — `vw_conta_cliente_furos`.
  - `useContaClienteCobertura(parceiroId)` — RPC `fn_conta_cliente_cobertura`.
  - `useRegistrarRecebimentoCliente()` — mutation `registrar_recebimento_cliente`,
    FAIL-LOUD (erro do banco vira toast destrutivo), invalida saldo + extrato + cobertura.

### Novos — telas/componentes
- `src/pages/administrativo/ContaCliente.tsx` — lista com busca por nome, colunas
  saldo (verde/vermelho), vencido em aberto, a vencer, última movimentação; clique abre o drawer.
- `src/components/financeiro/ContaClienteDrawer.tsx` — cabeçalho de números, card
  "Cobertura" (total em destaque, fontes 1 e 3 discriminadas, selo de sinal para análise
  de crédito), extrato com sinal +/− colorido, seção "Furos" só quando houver, e botão
  primário "Registrar recebimento".
- `src/components/financeiro/RegistrarRecebimentoDialog.tsx` — cliente (combobox com busca
  em `parceiros_comerciais`, pré-preenchido pelo drawer), valor, data (default hoje, sem
  futura), meio (6 opções), chave, pagador nome/documento, observação. Sem campo de pedido.
  Badge de `nivel_prova` no retorno (conciliado / aguardando_extrato / declarado_humano)
  com o texto de `aviso` quando vier.
- `src/components/pedidos/CoberturaClienteCard.tsx` — somente leitura: cobertura total vs
  valor do pedido, verde quando cobre, âmbar com o quanto falta quando não cobre.

### Existentes — edições cirúrgicas
- `src/App.tsx` — `lazy` import + `<Route path="conta-cliente" element={<ContaCliente />} />`
  dentro do bloco `/administrativo`.
- `src/config/rotasRegistry.ts` — entrada `/administrativo/conta-cliente` → `tela.fin_receber`
  (fallback do portão, espelhando a linha do banco).
- `src/pages/Pedidos/PedidoDetalhe.tsx` — inserir `<CoberturaClienteCard />` na coluna de
  pagamento. Nada removido nem alterado.
- `src/integrations/supabase/types.ts` — regenerar para as views e RPCs novas.

## Reaproveitamento
`Table`/`TabelaFetely`, `Sheet`/`Drawer`, `Card`, `Selo`, `Badge`, `Button`,
`formatBRL`/`formatDateBR`, `toast` (sonner) — sem paleta nova.

## Fora de escopo
Fiação do portão novo, botão de liberação, qualquer mudança nas telas de portão atuais.
