# Mercado Pago — Fase 1: importação automática diária

Objetivo: o sistema pede todo dia os relatórios do Mercado Pago, baixa e importa pelo mesmo caminho da importação manual. Não usa SFTP, webhook nem o agendamento do Mercado Pago. A lógica de atribuição fica para a Fase 2.

## 1. Onde está hoje a importação manual (confirmado no código)

Tudo roda no navegador, dentro de `src/pages/administrativo/ExtratoImportacao.tsx`. Não existe função do backend nem função de banco para o Mercado Pago.

| Fonte | Leitor da planilha | Gravação na tela | O que grava |
|---|---|---|---|
| `mp_release` | `src/lib/financeiro/xlsx-mp-reserve-release-parser.ts` (`parseXlsxMpReserveRelease`) | linhas ~1298–1380 | uma linha em `movimentacoes_bancarias` por liberação, com `hash_unico` `mp_rr\|<id_operacao>`. Saque, devolução e pagamento têm classes e descrições diferentes. Pagamento recebe `classe recebivel_b2c` / `regra_p1`. O CNPJ próprio vem de `unidades` |
| `mp_settlement` | `xlsx-mp-settlement-parser.ts` (`parseXlsxMpSettlement`) | ~1263–1296 | não cria linha: só enriquece via `fn_extrato_enriquecer` (conta, data, valor, referência do pedido, tipo de meio) |
| `mp_withdraw` | `xlsx-mp-withdraw-parser.ts` (`parseXlsxMpWithdraw`) | ~965–1035 | débito por saque, com `hash_unico` do leitor; quando a linha já existe, completa contraparte e id |

- **Como a tela reconhece cada arquivo:** pelo cabeçalho em português, na linha ~162. O arquivo manual é o XLSX baixado do painel do Mercado Pago.
- **Mesmo caminho para manual e automático.** Hoje as regras estão dentro da tela e uma função do backend não consegue usá-las. Por isso o plano tira esse trecho da tela para um módulo puro compartilhado: `src/lib/financeiro/mp/aplicarMp.ts`.
  - O módulo recebe linhas já normalizadas mais um "gravador", que é o cliente do banco.
  - Ele aplica as mesmas regras de hoje: hash, deduplicação, classe, enriquecimento e contadores.
- **Uma regra, duas leituras de arquivo:**
  - os leitores XLSX atuais passam a devolver o formato normalizado;
  - um leitor CSV novo (`csvMp.ts`) lê o arquivo da API e devolve o mesmo formato.
  - Os dois são testados com os mesmos casos: uma linha de liberação lida do XLSX e do CSV tem que gerar o mesmo hash e a mesma linha.
- **Como a função do backend chega no módulo:** ela não importa código da tela. O módulo é copiado sem alteração para `supabase/functions/_shared/mp/`, com um teste que falha se as duas cópias divergirem.
  - Alternativa equivalente: o módulo vive só no backend e a tela passa a chamar uma função do backend "importar arquivo MP". Depende da sua resposta à pergunta 3.

## 2. Tabela de controle: `mp_relatorio_execucao`

| Coluna | Uso |
|---|---|
| `tipo` | `release` \| `settlement` |
| `data_ref` | um dia BRT; no backfill, janela `periodo_inicio` / `periodo_fim` |
| `status` | `solicitado` → `processando` → `baixado` → `importado` \| `erro` \| `vazio` |
| `file_name`, `mp_report_id` | o que o Mercado Pago devolveu ao pedir e ao listar |
| `tentativas`, `proxima_tentativa_em`, `erro` | o erro guarda o status HTTP e o corpo da resposta |
| `extrato_importacao_id` | a linha de `extrato_importacoes` gerada (uma por execução, com `fonte_tipo` mp_release ou mp_settlement e `importado_por` nulo = robô) |
| `arquivo_storage_path`, `arquivo_sha256`, `arquivo_bytes` | o original em `contabil/bancos/...`, que vai para o Pacote do Contador |
| `origem` | `diario` \| `backfill` \| `reprocessar` |
| `contadores` | jsonb com lidas, novas, duplicadas e ignoradas, igual à importação manual |

- **Um dia por tipo:** a chave única é `(tipo, data_ref)` quando a origem é `diario`.
- **Leitura:** só para quem já lê `extrato_importacoes`.
- **Escrita:** só pelas funções do backend.
- A linha em `extrato_importacoes` passa a guardar o original na mesma estrutura que a Fase 1 do Pacote do Contador já criou.

## 3. Funções do backend e agendamento

Todas as chamadas ao Mercado Pago passam por `_shared/mp/mp-client.ts`. Ele envia `Authorization: Bearer MP_ACCESS_TOKEN` e trata qualquer resposta de erro devolvendo o status e o corpo.

1. **`mp-relatorios-config`**, rodada uma vez manualmente pela tela:
   - Faz GET da configuração atual e mostra.
   - Faz POST ou PUT da configuração das liberações (`/v1/account/release_report/config`):
     - `display_timezone: "GMT-03"`, `separator: ";"`, `file_name_prefix: "sncf-release"`;
     - `include_withdrawal_at_end: true`;
     - as colunas que o leitor de hoje usa, mais `EXTERNAL_REFERENCE` e `SOURCE_ID`.
   - Faz o mesmo nas vendas (`/v1/account/settlement_report/config`).
   - Não chama `/schedule` nenhuma vez.
   - Inclui um "Testar conexão": GET `/users/me`, que confirma o token e mostra o titular da conta.
2. **`mp-relatorios-pedir`**, agendada às 06:00 BRT:
   - Para cada tipo, cria a linha de ontem como `solicitado`.
   - Faz POST `/release_report` e `/settlement_report` com `begin_date` / `end_date` de ontem, em ISO UTC equivalente a 00:00–23:59:59 BRT.
   - Grava o que vier na resposta 202.
   - Se a linha já existir e não estiver em erro, não faz nada (é idempotente).
3. **`mp-relatorios-baixar`**, agendada às 07:00, 09:00 e 12:00 BRT:
   - Faz GET `/list`, liga cada arquivo à sua execução pelo período e pelo id e baixa pelo `file_name`.
   - Guarda o original no Storage e roda o leitor CSV e o `aplicarMp`.
   - Marca `importado` com os contadores.
   - **Em erro:** soma uma tentativa. Com no máximo 5 tentativas, volta para a fila com espera crescente; acima disso, fica `erro` definitivo e entra no alerta.
   - **Duas rodadas no mesmo dia não duplicam nada:**
     - o mesmo sha do arquivo não importa de novo;
     - mesmo que importasse, as linhas não duplicam, porque `hash_unico` e o enriquecimento já são idempotentes.
- **Agendamento:** 1 tarefa diária do pedido e 3 rodadas diárias da busca, ou seja, 4 execuções por dia, com custo desprezível.
- **Saques (`mp_withdraw`):** com `include_withdrawal_at_end` ligado, os saques vêm dentro do relatório de liberações e já viram débito pelo ramo "saque" do `mp_release`. O relatório separado de saques deixa de ser necessário.
  - Isso ainda precisa ser confirmado no primeiro arquivo real: os saques precisam aparecer e o hash não pode bater duas vezes com saques importados à mão pela planilha `mp_withdraw`.

## 4. Backfill: de 15/09/2026 até ontem

- **Botão "Buscar período"** na tela nova: você escolhe de e até, e o sistema quebra em janelas de até 30 dias. O limite da API é 60 dias; 30 deixa margem e arquivos menores.
- Cria execuções `backfill` por janela e tipo, e a busca segue o mesmo fluxo do diário.
- **Sobreposição com as importações manuais:**
  - **Liberações:** o `hash_unico` (`mp_rr|id_operacao`) deduplica. Se a mesma operação vier do XLSX e do CSV com o mesmo id e valor, cai como duplicada.
  - **Vendas:** o enriquecimento só preenche campos vazios. Repetir 15/09–25/10 enriquece de novo, sem duplicar.
  - O teste com o arquivo real precisa provar isso com números: num dia já importado à mão, novas = 0 e duplicadas = lidas.
- **Primeira execução de verdade:** um dia só (15/09), antes do período inteiro.

## 5. Tela nova

- **Onde fica:** uma aba "Mercado Pago automático" dentro de Importações bancárias, com `?aba=mp-auto`, slug próprio, `AbaPermitida` e `ConteudoAba`.
  - A aba precisa ser registrada pela `fn_nascer_tela`, que é sua (Claude conectado). Eu aviso quando a aba estiver pronta.
- **Conteúdo:**
  - **Grade de dias × tipo, cobrindo os últimos 60 dias:** a cor indica o status, e passar o mouse mostra os contadores e o erro com o corpo da resposta.
  - **Topo:** o último dia importado com sucesso por tipo e quantos dias estão faltando.
  - **Ações:** "Reprocessar dia" (cria uma execução `reprocessar`), "Buscar período" e "Testar conexão / Configurar relatórios".
  - Os botões novos ganham registro em `acao_superficie` e um slug `acao.*`.

## 6. Alerta no Dash de Tarefas

- **Nova fila em `tarefas_filas`:** "Mercado Pago sem importar". Segue o padrão das filas que o `PainelAtribuicoes` já lê.
- **Regra (numa view):** um dia D sem `importado` até 12:00 BRT de D+1, ou qualquer execução em `erro` definitivo.
- **O card mostra:** os dias e tipos em atraso e o último erro, com link para a aba.

## 7. Riscos e o que validar no primeiro teste real

1. **De onde vem o `file_name`:** se aparece na resposta 202 ou só na `/list`, e com que nome de campo. Até isso ser confirmado, o pareamento é feito pelo período e pela data de criação.
2. **Fuso:** checar que as datas de uma liberação conhecida batem com o XLSX manual. O padrão do Mercado Pago é GMT-04, então um erro aqui desloca o dia e quebra o hash.
3. **Separador e formato dos números:** `;` versus `,`, decimal com ponto e milhar sem separador. O leitor CSV precisa ser rígido e travar quando o formato não for o esperado.
4. **Cabeçalhos:** a API usa nomes técnicos em inglês (`SOURCE_ID`, `NET_CREDIT_AMOUNT` ...), e o XLSX manual traz os nomes em português. O mapa entre os dois fica num só lugar, com teste.
5. **O hash tem que ser igual nas duas leituras:** `id_operacao` (no CSV é `SOURCE_ID`?), data e valor iguais aos do XLSX, ou a sobreposição vira duplicata. Esse é o principal teste de aceite.
6. **Colunas que o leitor espera e talvez não existam na API:** conta destino do saque, meio de pagamento em texto e descrição ("Pagamento", "Saque", "Devolução"). Se faltarem, o mapa precisa derivar esses campos de `DESCRIPTION` / `PAYMENT_METHOD`.
7. **Limite de requisições e geração lenta:** um relatório pode demorar mais que a última rodada do dia. Nesse caso ele fica `processando` para o dia seguinte e entra no alerta.
8. **Permissões do token:** a aplicação "SNCF Relatórios" precisa de acesso aos relatórios da conta Fetely. O "Testar conexão" tem que mostrar o titular certo.

## Ordem de entrega (fases testáveis)

1. **Primeiro:** módulo compartilhado + leitor CSV + testes, e a tela manual passando a usar o módulo, sem mudar nenhum resultado. Teste: reimportar um XLSX manual dá todas as linhas como duplicadas.
2. **Depois:** tabela de controle, `mp-client`, configuração e testar conexão. Teste: a configuração gravada e o GET devolvendo GMT-03.
3. **Em seguida:** pedir e baixar um dia (15/09) à mão e conferir os 8 riscos acima.
4. **Por fim:** agendamento, backfill até ontem, a aba da tela e o alerta.

Nada é publicado sem a sua autorização.

## Perguntas para você

1. **Conta bancária:** qual linha de `contas_bancarias` é a conta Mercado Pago? Ou existe mais de uma conta MP?
2. **Saques:** você aceita que eles passem a vir só pelo relatório de liberações, e que o `mp_withdraw` manual vire legado?
3. **Onde mora a regra:** prefere a regra numa cópia compartilhada (a tela continua importando sozinha) ou a tela manual passando a chamar a mesma função do backend? A segunda é uma fonte só, mas o upload manual fica dependente do backend.
4. **Horário de corte do alerta:** 12:00 de D+1 está bom?
5. **Backfill das vendas (settlement):** começa em 26/10, logo depois da última manual, ou repete de 15/09 para garantir? Eu recomendo repetir, já que não duplica.
