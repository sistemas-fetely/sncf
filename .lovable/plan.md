# Saldo diário OFX — divergência ledgerbal × linha_saldo_ofx (Safra)

## Diagnóstico (confirmado no banco e no código)

Não há acúmulo. `fn_saldo_diario_registrar` é upsert por `(conta, data, origem)` — substitui a cada import.

A diferença de 19/08 (Safra: ledgerbal=199.233,99 × linha_saldo_ofx=36.417,01) é de **momento, não de soma**:
- `ledgerbal` = `LEDGERBAL>BALAMT` na data `DTASOF` → saldo de **fechamento**
- `linha_saldo_ofx` com `observacao=safra_saldo_inicial` → saldo de **abertura** (linha `SALDO INICIAL` do OFX)

Dois problemas reais encontrados:

1. **Prioridade invertida na leitura**: `vw_extrato_conta` escolhe o saldo do dia com `DISTINCT ON` priorizando `linha_saldo_ofx` (1) sobre `ledgerbal` (3). Quando a linha é `SALDO INICIAL`, a UI exibe abertura como "saldo do dia".
2. **Colisão de origem**: `safra_saldo_inicial` e `safra_saldo_total` gravam ambos com `origem='linha_saldo_ofx'`, dividindo a chave `(conta, data, origem)` — o último do arquivo sobrescreve o primeiro.

## Proposta de correção

1. **Separar origens por fonte**: em `ExtratoImportacao.tsx`, usar `cls.fonte_codigo` como `p_origem` (ex: `safra_saldo_inicial`, `safra_saldo_total`) em vez do genérico `linha_saldo_ofx`. Requer ampliar o constraint/valores aceitos de `saldo_diario_conta.origem` e ajustar o filtro da view.
2. **Priorizar fechamento sobre abertura** na `vw_extrato_conta`: ordem `safra_saldo_total`/`ledgerbal` (fechamento) antes de `*_saldo_inicial` (abertura).
3. Backfill: regravar linhas históricas de `origem='linha_saldo_ofx'` com a origem correta derivada de `observacao` (que já guarda o `fonte_codigo`).

## Arquivos/pontos tocados

- `src/pages/administrativo/ExtratoImportacao.tsx` (~linha 381): `p_origem` dinâmico
- Migração SQL: recriar `vw_extrato_conta` com nova prioridade; backfill de `origem`; ajustar constraint de `origem` se houver CHECK
- Sem mudança em `ofx-parser.ts` nem na RPC (upsert está correto)
