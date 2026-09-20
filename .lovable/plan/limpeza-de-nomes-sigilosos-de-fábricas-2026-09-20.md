# Limpeza de nomes sigilosos de fábricas

## Inventário confirmado
- `src/components/compras/ImportarPiPedidoTab.tsx:1130`: exemplo com nome próprio de fábrica.
- `src/pages/acervo/ImportarPI.tsx:937`: exemplo com o mesmo nome próprio.
- Nenhum outro termo proibido apareceu na primeira varredura dos arquivos do projeto.

## Alterações
1. Trocar os dois exemplos por `PI070626-162 (ZL), coleção Jingle Pop`, preservando o prefixo `Ex.:` onde já existe.
2. Na aba Importar PI da Chegada de Mercadoria, substituir o campo livre “Fornecedor” por “Fábrica”.
3. Carregar `codigo` e `nome` de `importacao_fabrica`, mas exibir e gravar somente `codigo` (a sigla) em `importacao_linha_lote.fornecedor`.
4. Mostrar ajuda curta informando que o valor selecionado é a sigla da fábrica.
5. Manter o fluxo, as tabelas e as funções existentes sem alteração de banco.

## Validação
- Rodar nova busca case-insensitive em todos os arquivos do projeto pelos 12 termos proibidos e confirmar resultado vazio.
- Rodar a verificação TypeScript obrigatória.
- Informar os arquivos e a quantidade exata de ocorrências alteradas.
