# F5 + F6 — Cobertura do cliente no pedido

## Implementação
- Reorganizar apenas o card lateral “Cobertura do cliente”, mantendo a leitura e a liberação atuais.
- Exibir cobertura total, rota, decomposição financeira e uma justificativa sempre visível quando a liberação não estiver disponível.
- Usar `InfoMetrica` no título para explicar a composição da cobertura.
- Consultar os créditos livres do cliente e ocultar a seção quando não houver nenhum.
- Permitir aplicar cada crédito nos estágios definidos, usando a função existente e mostrando a mensagem real em caso de erro.
- Após sucesso, atualizar o pedido, a cobertura e a lista de créditos.

## Regras preservadas
- Sem alterações em funções ou views do banco.
- Sem mudanças fora do card e de sua camada de dados estritamente necessária.
- Somente tokens do design system; responsivo e compatível com modo escuro.
- Não publicar.

## Validação
- Rodar o typecheck.
- Conferir no navegador o card, os estados sem botão, os créditos e a adaptação em larguras menores.
