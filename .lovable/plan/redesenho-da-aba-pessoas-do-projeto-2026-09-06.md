# Redesenho da aba Pessoas do projeto

## Objetivo
Tornar a escolha de participantes e papéis clara, contextual e segura, mantendo a gestão atual e sem alterar o banco.

## Alterações
- Criar um catálogo de pessoas específico para projetos, alimentado pela view `vw_pessoa_para_projeto`, com nome, cargo, departamento, unidade, gestor, vínculo e situação de acesso.
- Substituir o seletor de pessoa por busca e cards selecionáveis:
  - mostrar nome, cargo, departamento e gestor;
  - manter pessoas sem acesso visíveis, porém desabilitadas e identificadas;
  - ocultar membros atuais, responsável e criador;
  - explicar quando não houver ninguém disponível, distinguindo “todos já participam” de “ninguém mais com acesso ao sistema”.
- Substituir o seletor do novo papel por três cards vindos de `projeto_papel_dim`, com nome e descrição completos e destaque no selecionado.
- Manter a confirmação no botão com o texto `Adicionar {nome} como {papel}` e só habilitá-lo após as duas escolhas.
- Enriquecer a lista atual com cargo e departamento, preservando Responsável e Criador como entradas fixas.
- Corrigir o seletor de papel dos membros atuais para renderizar somente o nome no campo fechado, mantendo a descrição apenas na lista aberta.

## Regras preservadas
- Edição continua condicionada à permissão de gerenciamento do projeto.
- Adição, troca e remoção continuam usando os fluxos existentes com erro explícito, atualização otimista e reversão.
- Nenhuma alteração de SQL, regras de acesso ou bibliotecas.

## Arquivos previstos
- `src/hooks/tarefas/useProjetoMembros.ts`
- `src/components/tarefas/projetos/PessoasProjeto.tsx`

## Validação
- Conferir os estados com e sem permissão, pessoas com e sem acesso, listas vazias e troca de papel sem vazamento de descrição.
- Rodar a verificação de tipos e informar a lista final de arquivos alterados.
