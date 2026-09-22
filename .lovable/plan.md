# Regressão de fase do produto

## Implementação
- Ler as fases e seus rótulos de `produto_fase_dim`, usando a ordem cadastrada para identificar a fase imediatamente anterior.
- Na Ficha, mostrar “Voltar para <fase anterior>” somente quando houver anterior; abrir confirmação com produto, de-para, efeito comercial e motivo obrigatório.
- Reusar a chamada existente de `promover-fase-produto`, preservando os tratamentos de saldo, resposta do FOP e erros de autorização; no sucesso, recarregar a ficha e apresentar o de-para da fase.
- Na Mesa, adicionar a ação compacta “Voltar fase” por linha, com tooltip, confirmação e motivo obrigatório, usando a mesma fase anterior cadastrada e os mesmos tratamentos de resposta.

## Validação
- Rodar o typecheck exigido pelo projeto e lint apenas nos dois arquivos alterados.
- Conferir na prévia um produto ativo: botão, diálogo, rótulos e motivo obrigatório; confirmar também que a primeira fase não oferece regressão.

## Escopo
- Alterar somente `src/pages/acervo/FichaProduto.tsx` e `src/pages/acervo/MesaProduto.tsx`, além da atualização de acompanhamento no roadmap.
- Não alterar banco, fotos, campos, filtros ou regras de avanço.
