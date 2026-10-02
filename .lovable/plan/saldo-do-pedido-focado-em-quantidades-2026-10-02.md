# Saldo do pedido focado em quantidades

## Objetivo
Ajustar somente a sub-aba **Saldo** para responder o que falta chegar e quem deve agir, preservando integralmente os cards de resumo do topo e sem qualquer mudança no banco.

## Implementação
- Em `SaldoPedidoTab.tsx`, enriquecer as linhas com `cod_cadastro` vindo de `sncf_produtos` e alinhar a identidade visual do produto à sub-aba Linhas.
- Remover da consulta, do tipo e da tabela todos os campos e colunas de custo que deixarem de ser usados, após confirmar seus usos no arquivo.
- Ampliar a busca para código de cadastro, SKU e produto, com o novo texto solicitado.
- Substituir os filtros dinâmicos por cinco opções fixas: **Todos** e os quatro estados de `ROTULO_QUEM_DEVE`, sempre com contagem, ordem definida, explicação em `title` e estado desabilitado/muted quando a contagem for zero.
- Aplicar cabeçalho congelado e fundo opaco, mantendo o destaque visual de **A faturar** e **A confirmar** sem transparência durante a rolagem.
- Adicionar paginação com `RodapePaginacao`, tamanho inicial `DEFAULT_PAGE_SIZE`, tela `pedido_saldo`, resetando para a primeira página quando busca, filtro ou tamanho mudarem; renderizar apenas a página atual e manter a contagem da moldura baseada em todo o recorte filtrado.
- Em `ChegadaMercadoriaDetalhe.tsx`, trocar somente o texto de `ParaQueServe` da sub-aba Saldo.

## Validação
- Rodar o typecheck do aplicativo.
- Conferir no navegador a identidade do produto, filtros com contagens, paginação, cabeçalho congelado e ausência das colunas de custo.
- Não publicar.
