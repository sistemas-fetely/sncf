# Ajustar webhook e layout da Casa

## Implementação
- Trocar somente a validação HMAC indicada no webhook para aceitar também o segredo do app e registrar qual assinatura foi usada.
- Reorganizar a segunda fileira da Casa em três cartões iguais: Operação Financeira, Tarefas e Aniversariantes.
- Separar publicações ativas em uma fileira própria, mantendo a rotação; ocultar essa fileira quando vazia.
- Preservar dados, hooks, primeira fileira e demais cartões sem alterações.

## Verificação
- Rodar a checagem de tipos e a montagem do sistema.
- Conferir a Casa em desktop e celular, sem executar ações ou gravar dados.
