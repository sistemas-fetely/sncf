# Casa 22 — DRE de outubro/2026

| Linha | Antes | Depois | Acréscimo |
|---|---:|---:|---:|
| 2.4 — MDR e taxas de adquirente | R$ 798,73 | R$ 818,96 | R$ 20,23 |
| 7.3 — Comissões sobre vendas | R$ 0,00 | R$ 87,62 | R$ 87,62 |
| 9.2 — Ocupação e utilidades | R$ 0,00 | R$ 219,14 | R$ 219,14 |

Aluguel e comissão possuem uma despesa canônica ligada à conta a pagar, com competência 01/10/2026 e origem venda_fora. A reexecução retorna igual e mantém as mesmas três contas e somente duas despesas.

MDR usa exclusivamente o valor reconhecido em venda_fora_lancamento_mes; pagamentos/documentos posteriores ligados à mesma conta não geram uma segunda despesa. Não é criada uma taxa fictícia em titulo_a_receber.

Como PostgreSQL não permite substituir uma materialized view sem recriá-la, a DRE e sua integridade usam private.mv_dre_fato_venda_fora, com índice único mes/cod e atualização pelo fn_refresh_dre existente. O snapshot legado foi preservado e marcado como aposentado; refresh mantém ambos.

vw_dre_integridade manteve todos os oito indicadores e valores: despesas sem classe (63/R$72.048,21), cartão não importado, folha PJ sem NF (R$6.728,00), regime tributário; os demais verdes. Nenhum novo alerta.

Quatro testes de integração reais e onze testes do importador passaram. A DRE de outubro foi conferida no navegador. O seletor estava sem meses porque vw_dre_meses não existia; foi restaurada como projeção distinta de vw_dre_mensal.

Cancelamento/alerta preservam a decisão da função e o valor reconhecido da conta; não foram provocados por alterações destrutivas no parceiro real. A prevenção de duplicidade posterior foi implementada por ligação a documento/movimentação, sem classificar nem pagar contas reais para teste. Aplicação não publicada.