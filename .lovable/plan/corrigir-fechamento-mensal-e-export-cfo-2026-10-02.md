# Corrigir fechamento mensal e export CFO

## Implementação
- Criar `rpcTodas<T>` para ler RPCs em páginas de até 1.000 linhas, interromper apenas na última página e propagar o primeiro erro.
- Substituir as três leituras sujeitas a truncamento: posição da competência, evolução mensal e posições pré-fechadas usadas pelo export.
- Extrair o export CFO para um gerador ExcelJS dedicado, preservando os demais exports existentes.
- Montar as abas Resumo Mensal, Por Grupo, Evolução por SKU, Presunções quando aplicável e Critério e Premissas, com títulos, alertas, formatos, congelamentos e estilos especificados.
- Antes do download, confrontar o total de aterrissagem de cada competência com o snapshot da faixa de competências; qualquer diferença acima de R$ 0,01 abortará a geração com a mensagem exigida.
- Manter FAIL-LOUD e o estado de carregamento do botão, sem alterações no banco nem publicação.

## Validação
- Conferir no navegador que 10/2026 mostra 1.003 linhas.
- Baixar o arquivo real e inspecioná-lo com Python/openpyxl para validar números de abril e agosto, conferência, estilos, formatos e painéis congelados.
- Interceptar a resposta de competências para provocar divergência e confirmar toast bloqueante sem download.
- Executar typecheck e revisar console/rede por erros novos.

## Limites
- Alterar somente `FechamentoContabil.tsx` e os dois helpers novos solicitados.
- Não criar migrations, não alterar banco e não publicar.
