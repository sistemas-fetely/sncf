## O que já existe no repo (levantamento)

**Estoque Geral (CASA > SOPS > PRODUTO > ESTOQUE > GERAL)**
- Página: `src/pages/Comercial/EstoqueVirtual.tsx` (649 linhas), rota `/vendas/produto/estoque/virtual`
- Container de abas: `src/layouts/ProdutoEstoqueLayout.tsx` (Estoque Geral / Saúde do Estoque / Conciliação), montado dentro de `VendasLayout` em `src/App.tsx` (linhas ~309-314)
- Sidebar: `src/components/vendas/VendasSidebar.tsx` → item "Estoque" (`/vendas/produto/estoque`)
- Padrão da tela: `CasaPageHeader` com breadcrumb, faixa de `StatPill`, filtros `FilterInput`/`FilterSelectTrigger`, tabela `SortableTableHead` + `ordenarPor`, paginação "auto" calculada por altura

**Recebimento XPM**
- `/acervo/estoque/recebimento-xpm` hoje só redireciona para `/vendas/xpm` (`src/App.tsx` linha 356)
- Tela real: `src/pages/vendas/xpm/XpmIndex.tsx` (abas via `Tabs`) com `RecebimentoXpm.tsx` e `EstoqueXpm.tsx`

**Convenção de dados**
- Leitura: `useQuery` chamando `supabase.from("vw_...")` direto na página (views não tipadas usam cast `(supabase as any)`)
- Escrita: hook dedicado em `src/hooks/<dominio>/useXxx.ts` com `useMutation` → `supabase.rpc(...)`, `if (error) throw error`, `onSuccess` invalidando queryKeys; toast via `sonner`

Vou seguir exatamente isso — nenhum padrão novo, nenhum SQL.

---

## TELA A — Conferência de retorno de devolução

Arquivos a criar:
- `src/hooks/estoque/useDevolucoesRetornoPendente.ts` — `useQuery` sobre `vw_devolucao_retorno_pendente`, agrupando por `pedido_id` no front (a view vem por SKU)
- `src/hooks/estoque/useEstoqueCondicoes.ts` — `useQuery` em `estoque_condicao` (`codigo`, `rotulo`, `where ativo`) para popular o select de condição
- `src/hooks/estoque/useRegistrarRetornoDevolucao.ts` — `useMutation` chamando `registrar_retorno_devolucao(p_pedido_id, p_rows, p_doc_numero, p_obs, p_centro, p_data)`; `throw` no erro, invalida `["devolucao-retorno-pendente"]` e as queries de estoque
- `src/pages/estoque/RetornoDevolucao.tsx` — a tela
- `src/components/estoque/ConferirRetornoDialog.tsx` — o formulário de conferência por pedido

Comportamento:
- Lista de cards/linhas por pedido: `id_externo`, `nf`, `devolvido_em`, `motivo`, `dias_esperando` (badge de idade), soma de `qtd_pendente` e de `valor_custo_pendente`
- Contador no topo: pedidos pendentes, unidades pendentes, valor de custo parado
- Abrir um pedido → dialog com uma linha por SKU (`sku`, `nome_comercial`, `qtd_saiu`, `qtd_ja_retornada`, `qtd_pendente`) e, por linha, input de quantidade (limite visual = `qtd_pendente`) + select de condição vindo de `estoque_condicao`
- Campos do cabeçalho do dialog: NF de devolução (`p_doc_numero`), observação, data (default hoje), centro (default `XPM-SC`)
- Envia só as linhas com quantidade > 0 → retorno parcial é o caso normal
- `await` real: erro do banco vai cru no `toast.error(error.message)`, sem tradução nem máscara
- Sucesso: toast com `pedido/itens/unidades` do retorno e, se `aviso` vier preenchido, exibo o aviso em destaque (Alert dentro do dialog + toast), porque condição não vendável não volta ao disponível
- Nada de localStorage/sessionStorage

**Ponto que preciso te confirmar:** você pediu "cliente" no cabeçalho do grupo, mas a lista de colunas de `vw_devolucao_retorno_pendente` não tem cliente — só `id_externo`. Vou usar `id_externo` + `nf` como identificação e **não** vou derivar cliente por join no front. Se quiser o nome do cliente, precisa vir da view.

**Navegação:** encaixo como 4ª aba do `ProdutoEstoqueLayout`, rota `/vendas/produto/estoque/devolucoes`, rótulo "Retorno de devolução" (ícone `Undo2`). É o mesmo contexto operacional de estoque e herda sidebar/breadcrumb existentes. Adiciono também no `CommandPalette`. Alternativa, se preferir: aba dentro de `XpmIndex`. Vou de aba em Estoque salvo indicação contrária.

---

## TELA B — Estoque Geral migrado para `vw_estoque_rede`

Arquivo alterado: `src/pages/Comercial/EstoqueVirtual.tsx` (mais um `src/lib/estoque/status-venda.ts` novo para o mapa de rótulos/cores, evitando string crua e cor hardcoded espalhada).

1. Troca da query `vw_estoque` → `vw_estoque_rede`, com as colunas exatas que você listou. Interface `EstoqueSku` reescrita.
2. **Sai** a tag/fonte "Saldo Bling": removo o filtro "Todas as fontes → Razão/Bling", a coluna "Fonte" e o subtítulo de sincronização do Bling (e a query `sync-cursor-bling-estoque` que só servia pra isso). Entra uma coluna discreta "Bling (referência)" mostrando `referencia_bling` e `delta_bling`, em `text-muted-foreground`, com tooltip dizendo que é referência e não afeta status.
3. Mapa de rótulos completo: disponivel/baixo/indisponivel/pre_venda/a_chegar/sem_previsao/vendido_sem_lastro, com as cores semânticas do tema. Filtro de status passa a listar todos.
4. `vendido_sem_lastro` como alarme: KPI destacado no topo (SKUs + unidades comprometidas), linha da tabela com marcação de destaque (borda/fundo destrutivo suave) e atalho de filtro clicando no KPI.
5. Coluna "A chegar": mostra `pedido_importacao` e `eta_prevista` formatada; se `eta_prevista` for nula, mostra `status_importacao` com o texto "sem ETA definida" — nenhuma data inventada.
6. Colunas de posição: `fisico`, `bloqueado` (rotulado como "Não vendável / avarias"), `reservado`, `reservado_aguardando_produto`, `disponivel`, `furo`. O `furo` de avarias não é apresentado como divergência a investigar; deixo o texto neutro e ligo o detalhe por condição via `vw_estoque_posicao` (`furo_a_investigar` nulo = mecânica normal) no drawer do item.
7. `em_showroom` e `nao_contabil` em colunas próprias, nunca somados a `disponivel`; tooltip explicando que showroom é controle interno de SP.
8. Contagem: `contagem_em` / `dias_desde_contagem` como indicador de frescor.
9. Detalhe por centro: ao clicar numa linha, drawer lateral com `vw_estoque_centro` (`centro`, `centro_uf`, `centro_tipo`, `fiscal_sadio`, `fiscal_bloqueado`, `fisico_total`, `furo`, `reservado`, `disponivel`, `contagem_em`) e `vw_estoque_posicao` por condição — assim a rede consolidada continua sendo a tela principal, sem inflar a tabela.

Paginação, ordenação, busca e layout permanecem como estão.

---

## Arquivos tocados (resumo)

Criar:
- `src/hooks/estoque/useDevolucoesRetornoPendente.ts`
- `src/hooks/estoque/useEstoqueCondicoes.ts`
- `src/hooks/estoque/useRegistrarRetornoDevolucao.ts`
- `src/pages/estoque/RetornoDevolucao.tsx`
- `src/components/estoque/ConferirRetornoDialog.tsx`
- `src/components/estoque/DetalheEstoqueSkuSheet.tsx`
- `src/lib/estoque/status-venda.ts`

Alterar:
- `src/pages/Comercial/EstoqueVirtual.tsx`
- `src/layouts/ProdutoEstoqueLayout.tsx` (nova aba)
- `src/App.tsx` (nova rota)
- `src/components/navegacao/CommandPalette.tsx` (entrada de busca)

Nenhum SQL. Nenhuma coluna derivada além das que você listou.