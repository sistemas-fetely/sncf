# Mercado Pago — Fase 1: importação automática diária (plano, sem código)

Destino final do arquivo: `.lovable/plan-mp-fase1.md`. O modo plano só permite gravar em `.lovable/plan.md`; na aprovação, o primeiro ato do build é copiar este conteúdo para `.lovable/plan-mp-fase1.md` e devolver ao `plan.md` o conteúdo anterior (diagnóstico DEV-B2C-1401, já encerrado).

## 1. Onde está hoje o importador manual
- Tudo roda no front, em `src/pages/administrativo/ExtratoImportacao.tsx`:
  - `mp_release` (≈ linha 1382): `parseXlsxMpReserveRelease` → para cada liberação, um hash `mp_rr|<id_operacao>` → `inserirMovimentacao` (origem `mp_release`; saque/devolução/pagamento decididos pela DESCRIÇÃO; classe `recebivel_b2c` no pagamento).
  - `mp_settlement` (≈ linha 1347): `parseXlsxMpSettlement` → só enriquece, pela RPC `fn_extrato_enriquecer`; não cria movimento.
  - `mp_withdraw` (≈ linha 1049): `parseXlsxMpWithdraw` → cria a transferência quando não há par.
- Os parsers ficam em `src/lib/financeiro/xlsx-mp-*.ts` e leem **XLSX**. A API entrega **CSV**.
- **Saques:** o parser de liberações já reconhece "Saque…" e cria o débito com a conta de destino. Proposta: na rotina automática, os saques vêm só pelo relatório de liberações, e o `mp_withdraw` fica apenas para importação manual (pergunta 1).

### Como ter uma versão só
- Separar cada importador em duas camadas puras e testadas, numa pasta compartilhada importável pelo front (Vite) e pela edge (Deno, import relativo):
  - `normalizarMp*(linhas)`: recebe linhas já com chave de cabeçalho (vindas de XLSX ou de CSV) e devolve o mesmo objeto `MpLiberacao` / `MpTransacao` de hoje.
  - `aplicarMp*(sb, conta, impId, itens, cont)`: o laço de hoje (hash, checagem de duplicidade, `inserirMovimentacao`, `fn_extrato_enriquecer`). Só usa o client recebido, sem toast.
- A tela continua lendo o XLSX e passa a chamar essas funções; a edge lê o CSV e chama as mesmas. Mesmo hash = mesma deduplicação entre o manual e o automático.
- Local proposto: `supabase/functions/_shared/financeiro/mp/` e reexporte em `src/lib/financeiro/mp/`. Isso exige confirmar que o Vite resolve import fora de `src/`; se não resolver, faz-se o inverso com um espelho verificado por teste (pergunta 3).

## 2. Tabela de controle `mp_relatorio_execucao`
Colunas:
- `id`, `tipo` (`release` | `settlement`), `periodo_inicio`, `periodo_fim` (datas BRT)
- `origem` (`sncf_pedido` | `schedule_mp`), `status` (`solicitado` → `processando` → `baixado` → `importado` | `erro` | `sem_movimento`)
- `file_name`, `mp_report_id`, `tentativas`, `max_tentativas` (padrão 5), `proxima_tentativa_em`, `erro`
- `extrato_importacao_id` (FK `extrato_importacoes`), `arquivo_storage_path`, `sha256`, `bytes`, `linhas_lidas`, `criadas`, `duplicadas`, `enriquecidas`, `solicitado_em`, `importado_em`
- Único por (`tipo`, `periodo_inicio`, `periodo_fim`) e por `file_name` quando houver.

Regras:
- RLS `pode_ler_tabela`. Escrita só pela edge (service_role) e por uma RPC `fn_mp_relatorio_reprocessar(tipo, dia)`, que exige `acao.mp_relatorio.reprocessar`.
- Cada download vira uma linha em `extrato_importacoes` com `fonte_tipo` `mp_release`/`mp_settlement` e a conta MP. O original (CSV) sobe para o bucket `contabil` com a mesma regra de caminho de `arquivoOriginal.ts`: âncora no id da importação e depois a pasta da competência de `periodo_fim`. Grava `arquivo_storage_path`, `sha256` e `bytes`, e o Pacote do Contador já pega o arquivo.

## 3. Edge + agendamento
- Edge `mp-relatorios`, padrão `gateCronOuSessao` com `x-cron-secret` lido do cofre, e token `mp_access_token` via `get_vault_secret` (client service_role). Ações:
  - `pedir`: cria as linhas do dia anterior (00:00–23:59 BRT, enviado em UTC −03:00) para os dois tipos e faz `POST /v1/account/{release|settlement}_report`. Se a linha já existir e não estiver em erro, não faz nada.
  - `coletar`: `GET …/list` → casa cada linha `solicitado`/`processando` pelo período (`begin_date`/`end_date`, ou o id devolvido no POST) → `GET …/{file_name}` → sobe o original → normaliza e aplica → `importado`. O que ainda não estiver pronto continua `processando`.
  - Erro: `tentativas+1`, espera crescente; ao atingir o limite fica `erro`, visível na tela e no alerta.
  - `testar_csv` (só sessão com permissão): baixa um `file_name` e devolve cabeçalho e 3 linhas, sem gravar. É a ferramenta do primeiro teste real.
- Duas rodadas por `fn_cron_chamar_edge`: `pedir` às 06:00 BRT e `coletar` a cada hora das 07:00 às 13:00 BRT (7 vezes por dia). Atraso máximo: cerca de 1 hora depois de o MP terminar o arquivo.
- Idempotência: linha única por período + hash por operação no movimento + `fn_extrato_enriquecer`, que só atualiza. Rodar duas vezes não duplica.
- **Não** fazer PUT na configuração. O POST só manda `begin_date`/`end_date`.
- `settlement_report/config`: fazer `GET` no primeiro teste. Se não houver configuração, **parar e perguntar** (seria preciso criá-la).

## 4. Backfill (15/09/2026 → ontem)
1. Primeiro aproveita o agendamento do MP: lista os relatórios `created_from = schedule` e cria linhas com `origem=schedule_mp` para os períodos que cobrirem dias faltantes, e baixa esses.
2. Para o que sobrar, janelas de até 60 dias (15/09–13/11 já cobre tudo hoje), com `pedir` em janela única por tipo.
3. A sobreposição com o `mp_settlement` manual até 25/10 é segura: settlement só enriquece (reaplicar é inofensivo) e release usa o mesmo hash do manual.
4. Os contadores ficam gravados por linha (`duplicadas` deve ser alto no período já manual).
- Botão "Buscar retroativo" na aba, com data inicial (padrão 15/09), sob a mesma permissão.

## 5. Status na aba TI > Integrações > Mercado Pago
- Novo bloco "Relatórios automáticos" abaixo de Credenciais:
  - último sucesso por tipo;
  - grade dos últimos 45 dias × (Liberações, Vendas) com selo de status, contagens e erro;
  - contagem de "dias faltando";
  - "Reprocessar dia" e "Buscar retroativo".
- Os rótulos de status vêm de uma dimensão `mp_relatorio_status_dim`, sem texto hardcoded.
- As duas ações são registradas em `acao_superficie` (`acao.mp_relatorio.reprocessar`). Os filtros ficam na URL (`useEstadoTela`). Não cria tela nova.

## 6. Alerta no Dash de Tarefas
- Fila nova em `tarefas_filas`: "Mercado Pago — relatório não importado", alimentada por view `vw_mp_relatorio_atrasado`. Mostra o dia D sem `importado`/`sem_movimento` depois das 12:00 BRT de D+1, ou uma linha em `erro` com tentativas esgotadas.
- Responsável: Financeiro (pergunta 4). O card leva para a aba Mercado Pago com o dia em foco.

## 7. Riscos e o que validar no primeiro teste real
- **file_name:** se vem no POST (202) ou só na lista; e o formato `release-3201320885-…csv`.
- **Fuso:** a configuração já está em GMT-03. Conferir que o primeiro e o último DATE do arquivo caem no dia pedido.
- **Separador e decimal:** a configuração não mostrou `separator`. Detectar `;` ou `,`, e decimal com ponto ou vírgula, pelo cabeçalho.
- **Cabeçalhos em pt** (`report_language "pt"`) versus os nomes que o parser XLSX espera. Mapear as duas formas no normalizador e comparar com um arquivo manual do mesmo dia (mesmo total líquido e mesmos ids).
- **Colunas:** a configuração atual tem SOURCE_ID, mas é preciso confirmar EXTERNAL_REFERENCE (código do pedido), PAYMENT_METHOD, conta de destino do saque e o tipo de registro "Liberações". **Se faltar alguma, é preciso PUT, e isso exige sua autorização** (pergunta 2).
- **Settlement:** endpoints e configuração não confirmados; o relatório "todas as transações" pode exigir a configuração própria.
- Linhas "Reserva" e saldo inicial/total devem continuar fora (regra do parser atual).
- Limite de taxa e expiração do arquivo na lista.

## Perguntas
1. Saques automáticos só pelo relatório de liberações, deixando o `mp_withdraw` apenas manual? Proposta: sim.
2. Se o CSV da configuração atual não trouxer EXTERNAL_REFERENCE ou a conta de destino do saque, você autoriza o PUT adicionando só essas colunas (sem mudar fuso, prefixo nem agendamento)?
3. Código compartilhado: pode ficar em `supabase/functions/_shared/` com reexporte no front, ou prefere em `src/` com espelho testado?
4. Alerta: corte às 12:00 BRT de D+1 e responsável Financeiro? Quem recebe o card?
5. Conta MP: confirmar qual registro de `contas_bancarias` recebe as importações automáticas (a mesma usada nas manuais de setembro?).
6. Horários `pedir` 06:00 e `coletar` de hora em hora 07–13 BRT estão bons?

## Ordem de entrega (após aprovação)
Copiar o plano para `plan-mp-fase1.md` → migração (tabela, dimensão, view, fila, ação, RPC) → normalizadores e aplicadores compartilhados com testes, e a tela manual migrada (resultado idêntico) → edge `mp-relatorios` + `testar_csv` → primeiro teste real com um dia → agendamento → backfill → bloco na aba → alerta. Nada publicado.
