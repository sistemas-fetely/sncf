# Extrato mensal claro para o representante

## Entrega
- Substituir o documento atual por uma prestação de contas mensal: **Você recebe**, **De onde vem**, **A receber**, **Travado por atraso do cliente** e **Ajustes**.
- Usar o valor e as datas do extrato fechado sem recalcular o pagamento; vincular parcelas pelos IDs de liberação presentes no detalhe.
- Agrupar os pagamentos por cliente e a carteira futura por pedido; mostrar atrasos e ajustes somente quando existirem.
- Deixar a memória de cálculo recolhida na tela e em folha separada na impressão, removendo Origem, Proporção e desconto duplicado; ocultar Frete quando todos forem zero.
- Preservar fontes, cores e valores brasileiros, com tabelas legíveis em A4 retrato, cabeçalhos repetíveis e sem cortes de conteúdo.

## Premissas
- O documento passa a ter o extrato mensal como primeira página e a memória como anexo, substituindo a página antiga de desempenho/carteira geral.
- Sem extrato fechado, mostrar prévia explicitamente, sem inventar valor de pagamento ou data de fechamento.
- A carteira e os atrasos vêm da posição disponível na view no momento da emissão; essas fontes não oferecem uma fotografia histórica do fechamento. Identificar a data da consulta, sem apresentar a posição atual como histórica.
- Volumes maiores podem ocupar folhas de continuação; não reduzir letras ou cortar dados para forçar duas páginas.

## Detalhes técnicos
- Alterar somente o documento compartilhado entre impressão individual e lote e criar auxiliares/testes focados nas regras de seleção e agrupamento.
- Consultar `vw_comissao_detalhe` por representante, incluindo competências fechadas, e resolver liberações por `liberacao_id`; complemento pertence somente à explicação de Ajustes.
- Falha de consulta ou liberação sem correspondência gera erro explícito, não omissão silenciosa.
- Não criar rotas, modificar banco, permissões, outras telas, cálculos ou publicar.

## Validação
- Testar seleção das liberações, separação de complementos/estornos, agrupamento por pedido e filtro de atrasos.
- Conferir no navegador Lucia 10/2026, Anne 11/2026 e lote 10/2026, incluindo abertura do anexo.
- Gerar PDF A4 e revisar largura, paginação, cabeçalhos e ausência das tabelas antigas; conferir os diagnósticos da aplicação.