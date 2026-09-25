# KPI Clientes novos

## Objetivo
Acrescentar os indicadores de clientes novos exatamente nos três pontos pedidos, sem alterar outras telas ou regras.

## Alterações
- **Painel de representantes:** manter a coluna “Clientes”, exibir o total e a linha “N novos”, com âmbar quando houver clientes atendidos e nenhum novo; aplicar o tooltip com a definição e a divisão entre novos e recompras.
- **Ficha e extrato do representante:** incluir os três indicadores pedidos no resumo de desempenho, usando “abertos por você” no documento destinado ao representante.
- **Relatório Gerencial e PDF:** adicionar o card mensal, a coluna “Clientes novos” no comparativo, a coluna “Novos” por representante e a nota de rodapé única.

## Detalhes técnicos
- Consumir os campos já disponíveis em `vw_representante_financeiro` e `vw_comissao_gerencial_mensal`.
- Consultar `vw_cliente_abertura` pela competência selecionada para contar clientes por `vendedor_abertura_id`.
- Manter mensagens de erro reais e validar com `bunx tsgo --noEmit -p tsconfig.app.json` e inspeção das telas no preview.
