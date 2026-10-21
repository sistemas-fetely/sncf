---
name: Renegociação por cartão (link SafraPay)
description: Juros do parcelamento calculados pelo SNCF, padrão Cliente, aviso de pagamento em dobro sem bloqueio
type: feature
---
- Troca de instrumento aceita "Cartão (link SafraPay)": 1 título filho tipo cartão, valor total; parcelamento é do cartão.
- Juros por conta de: Cliente (padrão) ou Fetely. Cliente: total = principal × (1 + taxa da tabela para N parcelas); sem taxa cadastrada não confirma com Cliente.
- Nunca enviar parâmetro de juros ao SafraPay — só valor e máximo de parcelas.
- Título guarda os juros separados (valor_juros_cartao) para o contábil.
- Avisos sem bloqueio: pagamento em dobro com o boleto antigo; "se escolher menos parcelas, paga o mesmo total com juros".
- Validade do link = data de vencimento do título.
