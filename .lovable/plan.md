# Tooltips financeiros e percentuais padronizados

## Resultado
- Os cards “Vendido” e “Base faturada” da ficha do representante compartilharão uma dica com a ponte entre pedidos, notas e base faturada.
- Todos os percentuais em Representantes e Comissões terão no máximo duas casas decimais, inclusive gráficos e relatórios impressos.

## Implementação
1. Consultar `vw_representante_vendido_base` por `vendedor_id` com chave própria no React Query e erro explícito.
2. Reutilizar `InfoMetrica` nos dois cards, mostrando linhas alinhadas, valores monetários à direita, contagem de pedidos sem NF e sinais corretos; omitir ajustes zerados conforme a regra.
3. Ajustar `fmtPct` compartilhado para no máximo duas casas e substituir helpers/formatações percentuais locais nos dois módulos.
4. Preservar o padrão atual de casas mínimas de cada tela por meio de opção no helper único.

## Validação
- Rodar o typecheck.
- Conferir no navegador as pontes de Lucia e Carine.
- Revisar ficha, painel, Gerencial e Extrato para confirmar que nenhum percentual passa de duas casas.
