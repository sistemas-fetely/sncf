# Retenções de NFS-e pela data do pagamento

## O que muda para o usuário
- O bloco "Retenções de NFS-e do mês" da competência M passa a ter três grupos:
  - **(a) Emitidas neste mês** — como hoje.
  - **(b) Pagas neste mês** — emitidas antes de M, com pagamento confirmado cuja movimentação cai em M. Selo "Emitida em MM/AAAA · paga neste mês".
  - **(c) Em aberto** — emitidas nos 12 meses antes de M, com retenção e ainda sem pagamento confirmado. Selo "Em aberto desde MM/AAAA", com o mesmo seletor de candidato e o botão "Confirmar pagamento".
- A planilha de retenções do ZIP de M traz (a) + (b). Em (b), a Observação diz "emitida em MM/AAAA, paga em DD/MM/AAAA". O grupo (c) não entra na planilha de M; entra na do mês em que for pago.
- A busca de candidatos de pagamento vai da emissão − 5 dias até hoje, sem o limite de emissão + 45 dias. O resto da regra fica igual: valor dentro de 10% (exato com diferença de até R$ 0,01), débito, não duplicada, preferência pelo mesmo favorecido, até 30 resultados.
- No manifesto, (a) sem pagamento continua contando como "pagamento não localizado" no mês de emissão. (b) conta como entregue no mês do pagamento. (c) não conta como faltante.

Caso de conferência: a NFS-e 7827 (emitida em 15/09) deve aparecer em (c) no pacote de outubro e no de novembro. Se for confirmada com um pagamento de novembro, ela passa para (b) em novembro.

## Precisa de migration?
Sim, uma só: `CREATE OR REPLACE` de `fn_contabil_nfse_pagamento_candidatos`. A assinatura e as permissões ficam iguais; só a janela muda para `BETWEEN v_emissao - 5 AND current_date`. Não há tabela nem coluna nova: o grupo (b) sai de `contabil_nfse_pagamento` (vigente) junto com `movimentacoes_bancarias.data_transacao`.

## Arquivos

1. **`supabase/functions/_shared/pacote-contador/retencoes.ts`** (fonte única da tela e do ZIP)
   - `montarRetencoes(admin, userDb, ini, fim)` passa a montar três conjuntos:
     - (a) a consulta atual pela data de emissão dentro de M.
     - (b) vínculos vigentes com movimentação em [ini, fim] cuja NFS-e foi emitida antes de `ini`.
     - (c) NFS-e emitidas entre `ini − 12 meses` e `ini − 1`, sem vínculo vigente, lidas pelo XML e filtradas por `tem_retencao`, com candidatos pela RPC.
   - Cada item ganha `grupo: "emitida" | "paga_no_mes" | "em_aberto"`.
   - O retorno mantém os campos atuais (`total_nfse`, `lidas`, `pdf`, `nfse`, `erros_leitura`), que continuam valendo só para (a), e acrescenta:
     - `itens_planilha` = (a) + (b);
     - `em_aberto` = (c);
     - `totais` = (a) + (b);
     - `com_retencao` = (a) + (b);
     - `nao_localizados` = só (a) sem vínculo.
   - `linhaRetencao`: no grupo (b), a Observação ganha "emitida em MM/AAAA, paga em DD/MM/AAAA".
   - Erros de leitura de XML de (b) e (c) também entram em `erros_leitura`, marcados com o grupo (fail-loud).

2. **`supabase/functions/gerar-pacote-contador-v2/index.ts`**
   - O ZIP usa `xlsxRetencoes(ret.itens_planilha, …)`.
   - O manifesto passa a separar as contagens "pagas neste mês (emitidas antes)" e "em aberto de meses anteriores (informativo)". O "pagamento não confirmado" continua só com (a).
   - Reimplantar a edge.

3. **`src/components/contabil/RetencoesNfse.tsx`**
   - A tabela é dividida nos três grupos, com títulos e selos.
   - O grupo (c) reutiliza o seletor e a confirmação que já existem (`fn_contabil_nfse_pagamento_confirmar`), sem mudar o fluxo.

4. **Teste** — `src/lib/contabil/nfseRetencoes.test.ts` (ou um novo ao lado). Ele cobre:
   - a Observação do grupo (b);
   - a regra de classificação dos grupos numa função pura exportada de `retencoes.ts`: emitida em M, paga em M depois de emitida antes, em aberto dentro de 12 meses, e fora da janela.

## Fora do escopo
- O que fica igual: a pasta de PDFs de NFS-e do ZIP (continua pela emissão), a confirmação de pagamento, as regras de retenção e cálculo do líquido, as demais seções do pacote e os outros manifestos.
- Nada é publicado e nenhuma remessa é gerada. A validação é por dry-run da tela em outubro e novembro, conferindo a 7827.
