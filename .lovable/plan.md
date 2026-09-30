# Conclusão e salvamento da ficha da tarefa

## Implementação
- Extrair e reutilizar o controle circular já usado no board, aplicando-o ao título do peek e da página.
- Manter a escolha dos status de concluir/reabrir pela dimensão e guardar o status anterior para a ação “Desfazer”.
- Identificar gravações da tarefa por `mutationKey` e exibir “Salvando…”/“Salvo” no peek e na página; erros deixam o indicador vazio.
- Ajustar o rodapé do peek para “Fechar” e “Abrir tarefa completa”, ambos sem destaque principal.
- Tornar o selo do projeto legível com texto semântico e um ponto na cor do projeto.

## Detalhes técnicos
- Alterar somente os componentes e hooks de tarefas necessários, sem banco e sem publicação.
- Preservar a invalidação pelo prefixo `["tarefas"]` e o tratamento de erros existente.
- Executar `bunx tsgo --noEmit -p tsconfig.app.json` ao final.
