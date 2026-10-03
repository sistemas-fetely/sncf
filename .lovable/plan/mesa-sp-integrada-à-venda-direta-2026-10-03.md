# Mesa SP integrada à venda direta

## Implementação
- Identificar pedidos `VD-…` na Mesa com selo “Site SP · venda direta” e exibir a entrega escolhida no pedido.
- Ler o mapeamento de entrega da venda direta em `vd_modo_modal` e usá-lo como sugestão inicial na embalagem; manter a regra atual de CEP para os demais pedidos.
- Pedir confirmação quando o operador trocar o modal sugerido de um pedido Site SP.
- Ler `sem_despacho` na dimensão de modais e separar caixas de retirada das caixas prontas para despacho.
- Para retirada, ocultar qualquer ação de despacho e mostrar “Aguardando retirada no balcão”, orientação e link para Pedidos Site SP.
- Atualizar os contadores e grupos laterais para distinguir retirada e despacho.

## Validação
- Executar a checagem de tipos.
- Conferir o estado atual do build após as alterações.

## Escopo técnico
Somente `src/pages/logistica/ExpedicaoSp.tsx`, `src/pages/logistica/expedicao-sp/*` e componentes da Mesa. Nenhuma RPC ou estrutura do banco será alterada.
