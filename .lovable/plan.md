# Relatórios de comissão: memória por NF e Gerencial enxuto

## O que será entregue
- Incluir no extrato individual e no lote a seção **Memória de cálculo por NF**, logo após as parcelas pagas e antes dos estornos.
- Buscar as NFs do representante emitidas no mês anterior ao pagamento ou liberadas no mês do extrato, com ordenação por emissão e número.
- Exibir uma linha por linha de produto, subtotal quando houver múltiplas linhas, origem da NF, notas de retificação e os totais de Valor NF, Frete, Base e Comissão.
- Remover do Gerencial em tela e PDF o gráfico de custo × desconto, sua legenda e o bloco de NFs pagas.
- Manter cards, comparativo, Conta corrente, Por representante, botões de extrato e Inadimplência.
- Ajustar o PDF Gerencial para duas páginas quando a Conta corrente couber junto ao conteúdo da página 2; caso contrário, a terceira página conterá somente a Conta corrente.

## Regras de cálculo e apresentação
- Usar exclusivamente a view já existente `vw_comissao_memoria_nf`; nenhum banco, função ou migração será alterado.
- Tratar a competência da URL como mês de pagamento e consultar o mês anterior mais as NFs liberadas no próprio mês.
- Conferir no front que a comissão total de cada NF corresponde à soma das linhas; divergências serão mostradas claramente em vez de ocultadas.
- Formatar percentuais com até duas casas, ajuste em pontos percentuais e datas/valores no padrão brasileiro.
- Preservar o mesmo documento nas rotas individual e em lote.

## Validação
- Rodar o typecheck e conferir o build atual.
- No navegador, validar Lucia em 10/2026 e Anne em 11/2026, incluindo os valores e linhas indicados.
- Conferir o lote 10/2026 em A4 com a nova seção nos dois representantes.
- Conferir o Gerencial 09/2026 sem gráfico e sem NFs pagas, inclusive a paginação do PDF.
- Não clicar em ações de escrita, não alterar o banco e não publicar.

## Observação técnica
- A memória será carregada por representante e competência dentro do documento compartilhado. A tabela usará cabeçalho repetível e blocos de NF indivisíveis na impressão.
- A decisão de duas ou três páginas do Gerencial será tomada pelo espaço real disponível no documento, mantendo a Conta corrente inteira e legível.
