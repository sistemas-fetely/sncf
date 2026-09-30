# Tooltip explicativo do Funil

## Implementação
- Generalizar o componente já usado no Cockpit para aceitar conteúdo personalizado, preservando integralmente o uso e o visual atual da coluna Margem.
- Na aba Funil, buscar as etapas ativas de `devolucao_etapa`, ordenadas por `ordem`, incluindo descrição e obrigatoriedade, com cache longo.
- Adicionar o ícone de informação ao cabeçalho Funil e montar as seções O QUE É, ETAPAS, DE ONDE VEM e COMO LER no mesmo popover.
- Representar a legenda com as mesmas classes semânticas das bolinhas existentes e marcar discretamente as etapas obrigatórias.

## Validação
- Executar `bunx tsgo --noEmit -p tsconfig.app.json`.
- No navegador, conferir as 7 etapas e os quatro marcadores obrigatórios no Funil.
- Abrir o popover Margem no Cockpit e confirmar que aparência e conteúdo permaneceram iguais.

## Escopo
Somente o componente compartilhado, a tela Devoluções e o uso existente no Cockpit; sem banco e sem publicação.
