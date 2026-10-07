# Base de comissão no extrato

## Entrega
- Trocar o valor exibido em Próximos pagamentos e Em atraso para `base_parcela`, com o cabeçalho curto “Base”.
- Em Comissões pagas, exibir a base proporcional ao valor efetivamente liberado: `round(base_parcela × valor_liberado / comissao_da_parcela, 2)` quando a comissão original for positiva; caso contrário, usar `base_parcela`.
- Preservar “—” para complementos, a identificação e data na coluna Parcela, taxas e totais atuais.
- Remover todo uso de `valor_parcela` do documento compartilhado entre impressão individual e lote.

## Limites
- Somente frontend e testes; sem banco, migrations ou publicação.

## Validação
- Atualizar os testes das regras de base, incluindo proporcionalidade, arredondamento, fallback e complementos.
- Rodar testes e checagem de tipos.
- Conferir no navegador Lucia, Carine e Everson em 10/2026, incluindo os valores indicados.
