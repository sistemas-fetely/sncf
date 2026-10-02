# Bonificados sem registro e vocabulário de negócio

## Implementação
- Traduzir os tipos do Extrato pela dimensão de lançamentos, preservando o selo de estorno e os valores atuais.
- Evoluir o diálogo para aceitar instrumento/pedido iniciais, usar apenas pedidos bonificados sem registro e exibir o valor calculado pelo pedido.
- Mostrar os pedidos sem registro na aba Bonificações, com atalho de registro pré-selecionado, e traduzir estágios na lista existente.
- Criar a fila global “Bonificações a registrar”, protegida pela mesma permissão das bonificações do cliente, com indicadores, busca, tabela, links e diálogo.
- Invalidar todas as leituras relacionadas após uma concessão, mantendo FAIL-LOUD e sem alterar o banco.

## Validação
- Conferir no navegador MY BALLOON, o diálogo pré-selecionado e a fila global.
- Simular erro 400 na concessão para validar a mensagem real sem gravar dados.
- Conferir claro/escuro, busca, links, números e ausência de novos erros.
- Executar a verificação de tipos. Nada será publicado.

## Detalhes técnicos
- Alterações limitadas aos quatro arquivos indicados e ao novo componente da fila.
- A nova aba reutilizará `tela.cliente_bonificacoes`; não será criada rota nova nem registro de navegação.
