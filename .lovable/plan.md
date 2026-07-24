# Investigação — data prevista de recebimento no Fluxo de Caixa

Retrato fiel do que o código faz hoje. Nada a implementar.

## 1) De onde vem a data prevista

Existem **duas telas distintas** e elas leem fontes **diferentes**:

**Tela `/administrativo/previsao-recebimentos` (`src/pages/administrativo/PrevisaoRecebimentos.tsx`)**
- Lê a VIEW `vw_previsao_recebimentos` (linhas 95–97):
  ```ts
  supabase.from("vw_previsao_recebimentos").select("*").order("data_liquidacao_prevista", { ascending: true })
  ```
- Nessa view, `data_liquidacao_prevista` é **recalculado** — não vem do valor gravado na coluna homônima de `titulo_a_receber`. A definição da view faz:
  ```sql
  CASE
    WHEN pl.usa_vencimento THEN t.data_vencimento_atual
    WHEN pl.offset_primeira_dias IS NOT NULL
      THEN COALESCE(nf.data_emissao, t.data_criacao::date)
           + pl.offset_primeira_dias
           + (t.numero_parcela - 1) * COALESCE(pl.offset_entre_parcelas_dias, 0)
    ELSE NULL
  END
  ```
  join com `prazo_liquidacao pl ON pl.forma_pagamento_id = t.forma_pagamento_id AND pl.ativo`.
- Ou seja: a data exibida é derivada de **`nf.data_emissao` + régua `prazo_liquidacao`** (ou `data_vencimento_atual`, se a régua marca `usa_vencimento`). O que estiver gravado na **coluna** `titulo_a_receber.data_liquidacao_prevista` é ignorado pela view.

**Tela `/administrativo/fluxo-caixa` (`src/pages/administrativo/FluxoCaixa.tsx`)**
- **Não usa** a view `vw_previsao_recebimentos` e **não usa** a coluna `data_liquidacao_prevista`.
- Chama a RPC `fn_fluxo_caixa_projetado(p_horizonte, p_saldo_inicial)` (linha 52).
- A RPC agrupa entradas por `t.data_vencimento_atual` diretamente de `titulo_a_receber`:
  ```sql
  SELECT GREATEST(t.data_vencimento_atual::date, CURRENT_DATE) AS dia, SUM(...)
  FROM titulo_a_receber t
  WHERE t.status IN ('vigente','vigente_parcial','aguardando_pagamento',
                     'aguardando_envio_bling','aguardando_emissao_nf',
                     'vencido','vencido_suspenso','em_juridico')
    AND t.data_vencimento_atual::date <= d_fim
  GROUP BY 1;
  ```
- Consequência: as duas telas podem discordar. A Previsão de Recebimentos mostra a data derivada da régua/NF; o Fluxo de Caixa projeta pelo `data_vencimento_atual` do título.

## 2) UI para editar a data prevista

**Não existe** UI que edite `titulo_a_receber.data_liquidacao_prevista`. Rodando `rg data_liquidacao_prevista src`, todas as ocorrências são **leituras** (renderização em `TitulosTab.tsx`, `PrevisaoRecebimentos.tsx`, tipagem em `useTitulosCobranca.ts`, types.ts). Nenhum `.update(...)` ou RPC grava esse campo. A coluna existe fisicamente na tabela, mas está órfã do ponto de vista de escrita e é ignorada pela view.

O que **existe** de ajuste manual de data em recebíveis é `src/components/credito/ProrrogarVencimentoDialog.tsx` — mas ele atua sobre `data_vencimento_atual` (via RPC `solicitar_prorrogacao_boleto`, linha 36), não sobre `data_liquidacao_prevista`. E é fluxo de prorrogação de boleto, não edição livre da data prevista.

## 3) Filtro de títulos já recebidos

**Sim, ambos filtram — mas por caminhos diferentes.**

- **`vw_previsao_recebimentos`** filtra explicitamente pelo pagamento:
  ```sql
  WHERE t.status <> 'cancelado'
    AND COALESCE(t.data_pagamento_banco, t.data_pagamento) IS NULL
  ```
  Isto é, títulos com **qualquer** das duas datas de pagamento preenchidas ficam de fora.
- **`fn_fluxo_caixa_projetado`** **não olha** `data_pagamento_banco` diretamente. Filtra por uma whitelist de status abertos: `vigente, vigente_parcial, aguardando_pagamento, aguardando_envio_bling, aguardando_emissao_nf, vencido, vencido_suspenso, em_juridico`. A premissa é que, quando o título é recebido, o status sai dessa lista (vira algo como `liquidado`/`baixado`). Se por algum motivo um título tiver `data_pagamento_banco` preenchida mas o status continuar em uma dessas classes abertas, ele **continua entrando** no fluxo de caixa — a RPC não tem trava adicional por data de pagamento.

## Resumo em uma linha

- Previsão de Recebimentos = view (recalcula por NF + régua, exclui pagos por `data_pagamento_banco`/`data_pagamento`).
- Fluxo de Caixa = RPC direto na tabela (usa `data_vencimento_atual`, exclui pagos apenas via lista de status).
- Não há UI editando `data_liquidacao_prevista`; a coluna existe, mas é ignorada pela view.
