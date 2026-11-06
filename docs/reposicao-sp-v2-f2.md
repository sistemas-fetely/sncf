# Reposição SP v2 — F2

## Entregue
- Central: card Repor SP, painel na URL, Urgente hoje/Carga da semana, quantidades e seleção, totais em kits e peso estimado.
- Transferência: itens transportados em state de navegação, destino SITE-SP/finalidade reposição, mesmo painel do motor, `?sku=` pelo v2.
- Gaveta: classe, mínimo/teto, posição, situação, quantidade e ritmo pelo v2.
- Como vai: transportadoras via `fn_frete_estimado` e Correios via `correios-cotar`; dimensões reais do volume informadas pelo usuário, sem inferir embalagem pelo cadastro. Urgente mais rápido; carga mais barato; escolha alterável.
- Frete escolhido salvo via `atualizar_frete_pedido` após criação; falha explícita, retry reutiliza o pedido criado. Serviço Correios preservado nos metadados, sem confundir serviço com tipo de frete.

## Conferido
- 15 testes: regras do v2, totais/peso, pré-carga, seleção de frete e regressões de estoque.
- Preview autenticado: 30 urgentes e 286 produtos na carga (inclui os urgentes); quantidade editada para 7 preservada na Nova transferência; Site SP e Reposição Site SP pré-selecionados.
- Cotação real com SKU TALFACGRDPRT.LA/01877, 2 kits e volume informado 30×20×15 cm: PAC R$18,40/6 dias; SEDEX R$28,85/2 dias; Ícaro R$33,31/3 dias; Braspress R$81,25/4 dias. Urgente pré-selecionou SEDEX; clique manual mudou para PAC.
- `?sku=` do mesmo produto preencheu 10 kits do motor v2.
- Sem erros de execução nas interações verificadas; compilação automática OK.

## Não encontrado / limites
- Não existe seção de estoque em `/parametros`; não foi criada. `reposicao_regua` e `estoque_parametro` ficariam em uma seção de Estoque nessa tela, quando autorizada. Edição das dimensões não foi implementada nesta fase, conforme condição do pedido.
- O formulário antigo não possuía bloco de cotação nem persistência de frete. Foram reutilizadas as APIs existentes de Logística e atualização de pedido, sem alterar SQL.
- Peso existe em `sncf_produtos.peso_g`, mas 7 produtos da lista urgente estavam sem peso positivo: a tela informa o motivo e não inventa cotação (inclusive transportadora).
- Dimensões do cadastro são de produto, não da embalagem de transporte; o comparativo solicita medidas reais de um volume. Não foi implementado plano automático multivolumes.

## Não conferido
- Não criada nenhuma TRS, portanto gravação real do frete e retry após falha não exercitados.
- Não conferidos tema escuro, celular, gaveta, total da carga enviado ao formulário ou pré-seleção mais barata da carga no navegador (regra coberta em teste).
- Não houve alteração SQL, menu nem publicação.

## Arquivos
- `src/pages/Comercial/CentralEstoque.tsx`
- `src/components/estoque/central/PainelReposicaoSp.tsx`
- `src/components/estoque/central/GavetaProdutoEstoque.tsx`
- `src/components/transferencias/NovaTransferenciaForm.tsx`
- `src/components/transferencias/ComoVaiReposicao.tsx`
- `src/hooks/estoque/useReposicaoSp.ts`
- `src/hooks/estoque/useFretesReposicaoSp.ts`
- `src/hooks/estoque/useCentralEstoque.ts`
- `src/lib/estoque/reposicaoSp.ts` e `reposicaoSp.test.ts`
- `src/integrations/supabase/types.ts` (geração automática)
- `AGENTS.md`, `roadmap.md` e este relatório.