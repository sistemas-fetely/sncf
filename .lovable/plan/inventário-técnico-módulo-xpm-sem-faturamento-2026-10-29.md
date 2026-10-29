# Inventário técnico — módulo XPM (sem Faturamento)

Somente leitura. Nada foi editado. Casca: `XpmIndex.tsx` (rota /vendas/xpm, `useAbaUrl`, `AbaPermitida`/`ConteudoAba`/`usePodeVerAba` de `src/components/AbaGate`). Ordem das abas e slug: Expedições (`tela.wms_expedicoes`) · Painel XPM (`tela.wms_painel`) · Recebimento XPM (`tela.wms_recebimento`) · Estoque XPM (`tela.wms_estoque`) · Importar fases (`tela.wms_expedicoes`, reaproveitado) · Funil API × Arquivo (`tela.wms_expedicoes`, reaproveitado) · Faturamento (fora do escopo). Rótulos das abas estão fixos no código (constante `TABS`). Fallback da casca: "Você não tem acesso a nenhuma aba desta tela."

Não existe pasta `src/pages/vendas/xpm/components`. Os componentes compartilhados ficam soltos na pasta: `AlertaDivergencia.tsx`, `FunilFases.tsx`.

---

## 1. Aba Expedições — `ExpedicoesXpm.tsx`

Estado na URL: `useEstadoTela` com o prefixo `exp` (canal=todos, estagio=todos, situacao=curso_5d, farol="", sla=todos, busca="", aberto=""). A consulta principal é `vw_xpm_risco_atraso` `select *` ordenada por `data_expedicao desc`, com refetch a cada 60s e também ao voltar o foco. A chave é `xpm-expedicoes`.

| Bloco/seção | Elemento | O que mostra | Fonte de dados | Ação | Público |
|---|---|---|---|---|---|
| Cabeçalho | PageHeader | "Expedições XPM" / "Andamento físico das expedições no armazém, do pedido ao embarque." | — | — | — |
| Cabeçalho | Texto | "sincronizado agora / há X min / há X h / há X d / nunca sincronizado" | máx(`sincronizado_em`) das linhas da `vw_xpm_risco_atraso` | — | Integração |
| Cabeçalho | Botão | "Sincronizar" | — | edge `zenlog-sync-expedicoes` body `{dias:7}`; se `ok=false`, lança erro; toast "Sincronizado: N expedições"; invalida as chaves xpm-expedicoes, xpm-expedicao-itens e xpm-expedicao-eventos | Integração |
| Alerta | `AlertaDivergencia` (ver §7) | "Divergência de estágio" | `vw_xpm_divergencia_estagio` | — | Integração |
| Funil | `FunilFases` (ver §8) | 6 fases | `vw_xpm_risco_atraso` | clicar numa fase filtra por `estagio` (clicar de novo limpa); só funciona com parados > 0 | Operação |
| KPIs | Card | "Em curso" | contagem de `estagio_seq < 6` | — | Operação |
| KPIs | Card | "Separado sem NF" (borda e texto em warning se > 0) | `estagio_seq >= 2 && < 4` | — | Operação |
| KPIs | Card clicável | "Em atenção" (warning se > 0; anel quando está ativo) | `farol = 'atencao'` | alterna o filtro `farol=atencao` | Operação |
| KPIs | Card clicável | "Em risco" (ícone AlertTriangle, destructive se > 0) | `farol = 'risco'` | alterna o filtro `farol=risco` | Operação |
| KPIs | Card | "Com corte" | `tem_corte = true` | — | Operação |
| KPIs | Card | "Peso em curso" (kg) | Σ `peso_bruto` onde `estagio_seq < 6` | — | Gestão |
| Tabela "Expedições" | Busca | "Buscar por pedido, cliente, NF ou código XPM…" | busca em codigo, nf_numero, pedido_sncf, pedido_display, pedido_loja, cidade_entrega, cliente_sncf, destinatario_nome | filtro local | Operação |
| Tabela | Select Canal | Todos os canais / B2B / B2C / SEM NF | `canal` | filtro local | Operação |
| Tabela | Select Estágio | Todos os estágios / SOLICITADO…EXPEDIDO (lista fixa no código) | `estagio_codigo` | filtro local | Operação |
| Tabela | Select Situação | Em curso + 5 dias (padrão) / Só em curso / Todos (45 dias) / Só expedidas | `estagio_seq < 6`; janela = `t_expedido ?? data_expedicao` ≤ 5 dias (`JANELA_POS_EMBARQUE_DIAS`) | filtro local | Operação |
| Tabela | Select SLA | SLA: todos / No prazo / Atenção / Estourado | `farol_sla` | filtro local | Operação |
| Tabela | Linha clicável | expande `LinhaExpandida` | — | grava `aberto=<codigo>` na URL | Operação |
| Tabela vazia | Texto | "Nenhuma expedição neste recorte." | — | — | — |

Ordenação: as abertas (`estagio_seq < 6`) vêm primeiro. Dentro de cada grupo, a mais antiga vem primeiro, por `t_solicitado ?? data_expedicao ?? ultimo_evento_em`. Valores nulos vão para o fim, com desempate por `codigo`.

Colunas da tabela:
| Coluna | Origem |
|---|---|
| (chevron) | estado `aberto` |
| Pedido | `pedido_display ?? codigo`; linha 2: "XPM {codigo} · NF {nf_numero}" ou "sem NF" |
| Cliente | `cliente_sncf ?? destinatario_nome` |
| UF | `uf_display` |
| Canal | Badge `canal` (B2B=default, B2C=secondary, SEM NF=outline) |
| Solicitado | `t_solicitado` (dd/mm + hh:mm) |
| Estágio | `Semaforo` (6 quadrados: cheio se n ≤ `fase_seq`; verde-claro se `tem_casa_em_andamento` e n = `fase_seq_em_andamento`, com tooltip "{fase_rotulo_em_andamento} — em andamento") + `fase_rotulo`; linha extra "XPM diz: {arquivo_fase_rotulo}" (em warning se `fonte_da_verdade='arquivo'`; o title traz `arquivo_gerado_em`) |
| Vol | `quantidade_volumes` |
| Peso | `peso_bruto` |
| SLA | `CelulaSla`: usa `farol_sla`, `horas_xpm`, `horas_sla`, `horas_excedidas_xpm`, `horas_cliente`, `estouro_so_por_fim_de_semana` |
| Dias | `dias_parado`, ou Badge "Pausado" se `pausada_agora` |

Cores e badges:
- Fundo da linha: `farol=risco` → destructive/5; `atencao` → warning/5; `pausada` → nenhum; senão, `tem_corte` → warning/5. A linha fica com opacidade 60% se `estagio_seq >= 6` e estiver dentro da janela de 5 dias.
- SLA (`farol_sla`, calculado em `vw_xpm_ciclo`): `horas_sla` nulo → "—"; `horas_xpm > horas_sla` → "estourado", Badge destructive "+Nh" (ou "+Nd" se > 48h); `horas_xpm >= 0,75·horas_sla` → "atencao", Badge em warning "x/yh"; senão → "no_prazo", Badge outline "x/yh". Um ponto cinza aparece se `estouro_so_por_fim_de_semana` (`horas_cliente > sla && horas_xpm <= sla`). O tooltip mostra "Relógio XPM: Xh de Yh", "Cliente esperando: Zh" e "Fora do prazo do cliente só por causa do fim de semana."
- Dias: > 5 → destructive; ≥ 3 → warning (ambos só se a expedição não estiver pausada).
- `farol` (em `vw_xpm_risco_atraso`): `concluida` → 'concluida'; `pausada_agora` → 'pausada'; `horas_em_curso_liquido >= P90` do canal (ou o geral) → 'risco'; `>= P75` → 'atencao'; senão → 'no_prazo'. Os percentis vêm de `vw_xpm_ciclo` concluídas, sobre `horas_ciclo_liquido`.

Linha expandida (`LinhaExpandida`):
| Bloco | Elemento | Mostra | Fonte | Ação | Público |
|---|---|---|---|---|---|
| Dados | campos | Transportadora (`transportadora_nome ?? transportador_cnpj`), Volumes, Peso bruto, Chave da NF (`nf_chave`) | linha da view | — | Operação |
| Pausa (`BlocoPausa`) | Badge "Pausado" + motivo + "desde … (N h)" + observação | pausa com `retomado_em` nulo | tabela `xpm_expedicao_pausa` (where `expedicao_codigo`, order `pausado_em desc`); motivos em `xpm_motivo_pausa` (`ativo=true`, order `ordem`; cai em "Motivo não catalogado" se não achar) | Botão "Retomar" → **update direto** `xpm_expedicao_pausa.retomado_em=now()` (sem RPC) | Operação |
| Pausa | Botão "Pausar" → Dialog "Pausar expedição {codigo}" (Select "Motivo", Textarea "Observação", botões "Cancelar"/"Confirmar pausa") | — | — | **insert direto** em `xpm_expedicao_pausa` {expedicao_codigo, motivo_id, observacao, criado_por}; invalida xpm-expedicoes e xpm-pausas | Operação |
| Pausa | Lista das pausas encerradas | motivo, início → fim, horas, observação | `xpm_expedicao_pausa` | — | Gestão |
| Linha do tempo | "Linha do tempo (eventos por volume)" | nome da fase (`wns_fases_xpm.descricao ?? codigo ?? "Evento N"`), `inicio`, "qtd N", `status` | `xpm_expedicao_evento` (where `expedicao_codigo`, `eh_reemissao=false`, order `inicio`); `wns_fases_xpm` (wns_id, codigo, descricao, sequencia) | — | Integração |
| Itens | Tabela Produto / Solicitado / Atendido | `CodProduto(codigo_produto)`, `quantidade_solicitada`, `quantidade_atendida`; corte (atendido < solicitado) aparece em destructive como "N (−d)" | `xpm_expedicao_item` (where `expedicao_codigo`, order `numero_item`) | — | Operação |

Observação: `valor_unitario` é carregado mas não aparece na tela.

---

## 2. Aba Painel XPM — `PainelXpm.tsx`

Consulta: `vw_xpm_risco_atraso` `select *` ordenada por `data_expedicao desc` (chave `xpm-ciclo`, sem refetch). O filtro de período é feito no front, sobre `data_expedicao >= hoje − N dias`. O período fica em estado local (não vai para a URL).

| Bloco/seção | Elemento | O que mostra | Fonte / regra | Ação | Público |
|---|---|---|---|---|---|
| Cabeçalho | PageHeader | "Painel XPM" / "Ciclo do armazém, do pedido solicitado à expedição efetiva." | — | — | — |
| Cabeçalho | Select | Últimos 30 / 60 / 90 dias (padrão 90) | estado local | filtra o "noPeriodo" | Gestão |
| Alerta | `AlertaDivergencia` | (§7) | `vw_xpm_divergencia_estagio` | — | Integração |
| Funil | `FunilFases` sem clique | (§8) | `vw_xpm_risco_atraso` | — | Gestão |
| Card "Risco de atraso" | Subtítulo | "Sem SLA acordado, o limiar vem do próprio histórico: atenção a partir do P75 do canal, risco a partir do P90." | — | — | Gestão |
| | KPI "Risco" (destructive se > 0) | fila (`concluida=false`, **todas as linhas, sem filtro de período**) com `farol=risco` | — | Operação |
| | KPI "Atenção" (warning se > 0) | fila com `farol=atencao` | — | Operação |
| | KPI "No prazo" | fila com `farol=no_prazo` | — | Gestão |
| | KPI "Pausadas" (texto muted) | fila com `farol=pausada` | — | Operação |
| | Tabela (ou "Nenhuma expedição em risco.") | fila com farol risco/atencao, ordenada por `horas_em_curso_liquido desc` | — | Operação |
| Card "Aderência ao SLA" | Subtítulo | "SLA definido pela Fetely. O relógio do cliente conta hora corrida; o da XPM desconta fim de semana, conforme a cláusula 3.3 do contrato." | base = noPeriodo com `concluida=true` e `horas_sla` não nulo | — | Gestão |
| | Tabela por canal + Total (ou "Nenhuma expedição concluída com SLA definido no período.") | — | — | Gestão |
| | Nota | "A diferença entre os dois relógios é o custo do fim de semana — não é falha da XPM nem atraso operacional." | — | — | Gestão |
| (se noPeriodo vazio) | Card | "Nenhuma expedição no período escolhido." | — | — | — |
| Card "Ciclo total, por canal" | Tabela | canais B2B / B2C / SEM NF + Total | concluídas do período com `horas_ciclo_liquido` | — | Gestão |
| | Nota de pausas | "Nenhuma pausa registrada no período." / "N expedições tiveram pausa no período, somando X h descontadas do ciclo." | noPeriodo: `qtd_pausas > 0`, Σ `horas_pausadas` | — | Gestão |
| Card "Distribuição do ciclo" | Barras por faixa: até 24h / 24–48h / 48–72h / acima de 72h × canal ("n · x%") | concluídas, `horas_ciclo_liquido`; opacidade B2B 100%, B2C 70%, SEM NF 40% | — | Gestão |
| Card "Tendência mensal" | Tabela Mês / Expedições / Ciclo médio / P90 (vazio: "Sem expedições concluídas com carimbo de expedição.") | **todas as linhas** concluídas com `t_expedido`, agrupadas por `t_expedido` AAAA-MM, últimos 6 meses | — | Gestão |
| Card "Fila atual" | KPI "Em curso" | noPeriodo `concluida=false` | — | Operação |
| | KPI "Pausadas" (borda warning se > 0) | noPeriodo `pausada_agora=true` | — | Operação |
| | KPI "Mais antiga em curso" | `horas_em_curso_liquido`/24 da primeira em curso, em "d" | — | Operação |
| | Tabela (vazio: "Nenhuma expedição em curso.") | em curso do período, ordenadas por `horas_em_curso_liquido desc` | — | Operação |
| Card "Volume expedido no período" | KPIs "Expedições concluídas", "Volumes", "Peso bruto" (kg) | concluídas: contagem, Σ `quantidade_volumes`, Σ `peso_bruto` | — | Gestão |
| Rodapé | Nota | "A XPM registra horário real apenas em Solicitado, Embarcado e Expedido. Separação, conferência e nota fiscal entram em lote e não têm carimbo próprio — por isso não há tempo por etapa." | — | — | Gestão |

Colunas das tabelas:
- **Risco de atraso**: Pedido (`pedido_display ?? codigo` + "XPM {codigo}") · Cliente (`cliente_sncf ?? destinatario_nome`) · Canal (Badge) · Estágio (`estagio_codigo`) · Horas em curso (`horas_em_curso_liquido` via `fmtDuracao`: "X.X h", ou "N d" se > 48) · Limiar do canal (`limiar_risco` se risco, senão `limiar_atencao`) · Farol (`BadgeFarol`).
- **Aderência ao SLA**: Canal · Meta (h) (`horas_sla`, se for único no grupo; senão "—") · Expedições (n) · Aderência cliente (% de `dentro_sla_cliente=true` + "(ok/n)" + barra) · Aderência XPM (% de `dentro_sla_xpm=true` + barra) · Excesso médio (média de `horas_excedidas_xpm` entre os que estouraram no relógio XPM) · Só por fim de semana (contagem de `estouro_so_por_fim_de_semana=true`).
- **Ciclo total**: Canal · Expedições · Média · Mediana · P90 · Melhor · Pior (sobre `horas_ciclo_liquido`; o P90 é calculado no front com ceil(p·n)−1).
- **Tendência**: Mês · Expedições · Ciclo médio · P90.
- **Fila atual**: Pedido · Cliente · Canal · Estágio (`estagio_codigo`) · Horas em curso (`horas_em_curso_liquido`, em h com 1 casa) · Farol (`BadgeFarol`) · Pausada (Badge "Pausada" se `pausada_agora`).

Cores e badges:
- `BadgeFarol`: risco → destructive "Risco"; atencao → secondary "Atenção"; pausada → outline "Pausada"; concluida → outline "Concluída"; senão → outline "No prazo".
- Aderência (texto e barra): < 50% destructive; < 80% warning; ≥ 80% success; nulo muted.
- Canal: B2B default, B2C secondary, SEM NF outline.

Observação: o recorte não é o mesmo em todos os blocos. "Risco de atraso" e "Tendência" usam todas as linhas; os outros blocos usam o período escolhido.

---

## 3. Aba Recebimento XPM — `RecebimentoXpm.tsx`

Nenhum estado vai para a URL, exceto a leitura única de `?pedido_ref=` para pré-selecionar o pedido.

| Bloco/seção | Elemento | O que mostra | Fonte de dados | Ação | Público |
|---|---|---|---|---|---|
| Cabeçalho | PageHeader | "Recebimento XPM" / "Envie a planilha de cadastro pra XPM e ingira o Termo de Conferência de volta pra dar entrada no estoque." | — | — | — |
| Ação 1 "Gerar planilha de recebimento XPM (SKU × NF)" | Descrição | "Escolha o pedido e baixe a planilha que traduz a NF para os nossos SKUs (Código Material × NF × Cod. NF)…Pedido em fase 1 (sem NF) sai com NF e Cod. NF vazios." | — | — | Operação |
| | Select "Pedido de importação" | rótulo "{numero_pedido} · {pedido_ref} · fase 1 — sem NF / fase 2 — com NF / fase mista · N linhas" | `vw_xpm_cad_item` (numero_pedido, pedido_ref, fase), agregado no front por `pedido_ref`, ordem `numero_pedido desc` | — | Operação |
| | Botão "Gerar planilha" | — | — | fetch POST na edge `gerar-planilha-xpm` {pedido_ref}; baixa o .xlsx (nome vem do Content-Disposition; padrão `XPM_Cad_item_{ref}.xlsx`) | Operação |
| Ação 2 "Subir Termo de Conferência" | Descrição | "Ingerir o retorno da XPM — dá entrada no estoque e gera tarefas de divergência." | — | — | Operação |
| | Input "Nº do Termo" (ex.: RE0009-02) | — | — | — | Operação |
| | Input data "Data de recebimento" — "data do termo — não é a data de hoje" | — | — | — | Operação |
| | Select "Centro" | `nome` | `centro_distribuicao` (`ativo=true`, order `ordem`); padrão **"XPM-SC" fixo no código**, senão o primeiro | — | Operação |
| | Input arquivo "Arquivo (.xlsx)" | — | — | — | Operação |
| | Botão "Ingerir Termo" | — | — | fetch POST multipart na edge `ingerir-termo-xpm` (file, termo, data_recebimento, centro); invalida vw_compras_nf_sem_entrada, compras-pendencias, compras-pendencias-xpm, vw_importacao_pedido_regua | Operação |
| | Resultado "Termo {termo} ingerido" | 9 mini-cards: Linhas no termo · Entradas cobertas (success) · Excesso (warning) · Avarias (destructive) · Tarefas · Sem NF (warning se > 0) · SKUs sem custo (warning se > 0) · Chegada registrada (success se > 0; title "Embarques que receberam a data de chegada e o status Entregue a partir deste termo") · Embarque ambíguo (warning se > 0; title "Pedido com mais de um embarque em aberto…") | resposta da edge (`linhas_termo`, `entradas_cobertas`, `entradas_excesso`, `entradas_avarias`, `tarefas`, `linhas_sem_nf`, `skus_sem_custo`, `embarques_carimbados`, `embarques_ambiguos`) | Link "Abrir Painel › Data furada" → `/vendas/produto/chegada-mercadoria?aba=painel&visao=embarque&furada=1` (se ambíguos > 0); link "Ver tarefas" → `/tarefas?origem=estoque` (se tarefas > 0) | Operação |
| Card "Pesos de produto" | Descrição | "A planilha da XPM exige peso por SKU. Baixe o modelo com os SKUs que faltam, preencha e suba." / "Grava no cadastro de produto." | — | — | Operação |
| | Botão "Baixar modelo de pesos" + nota ("SKUs sem peso do pedido {ref}." / "Sem pedido selecionado acima — baixa todos os SKUs do catálogo sem peso.") | — | — | edge `pesos-produto` {acao:"modelo", pedido_ref?} → .xlsx | Operação |
| | Input "Arquivo preenchido (.xlsx)" + Botão "Conferir" | — | — | edge `pesos-produto` multipart {acao:"importar", file, confirmar:false, permitir_sobrescrita} | Operação |
| | Prévia: "N gravados · N a preencher · N sobrescreve · N igual · N peso inválido (destructive se > 0) · N SKU desconhecido (destructive se > 0)" | resposta (`gravados`, `preenche`, `sobrescreve`, `igual`, `peso_invalido`, `sku_desconhecido`) | — | Operação |
| | Amostra Código / De / Para / Classe | `amostra[]` (sku via `CodProduto`, de, para, classe); a linha fica em destructive se classe = sku_desconhecido ou peso_invalido | — | Operação |
| | Checkbox "Permitir sobrescrever pesos já preenchidos (N)." (só se sobrescreve > 0) | — | — | Operação |
| | Botão "Confirmar gravação" / mensagem "Gravação concluída." | — | — | mesma edge com confirmar:true; invalida xpm-cad-item-pedidos | Operação |
| Rodapé | `PainelSyncEstoque` (`src/components/acervo`) | cards por sistema/tipo (rótulos fixos no componente, ex.: "Shopify · excluídos", "Bling · leitura de saldos", "Bling · envio de estoque", mais extras "{sistema} · {tipo}"); status, tempo relativo de `ultima_execucao`, "N registro(s)"; "sem execução ainda" | `vw_estoque_sync_status` (sistema, tipo, status, registros_atualizados, ultima_execucao, detalhes) | — | Integração |

Cores do `PainelSyncEstoque`: `status='sucesso'` → borda/fundo success; qualquer outro → destructive; sem linha → muted.

---

## 4. Aba Estoque XPM — `EstoqueXpm.tsx`

Estado na URL com o prefixo `est` (busca, status=todos, posicao).

| Bloco/seção | Elemento | O que mostra | Fonte | Ação | Público |
|---|---|---|---|---|---|
| Cabeçalho | PageHeader | "Estoque XPM" / "Posição sincronizada direto da XPM. Atualiza sozinha todo dia às 03:25." | — | — | — |
| Cabeçalho | Texto | "posição de dd/mm/aaaa hh:mm" | primeiro `data_hora_posicao` da conciliação, senão a posição mais recente | — | Integração |
| Cabeçalho | Botão | "Sincronizar agora" | — | edge `zenlog-sync-estoque` body {}; toast "Estoque sincronizado — N linhas de posição" (`linhas ?? total ?? registros`); invalida xpm-estoque-conciliacao e xpm-estoque-posicoes | Integração |
| Erro | Card | "Erro ao carregar a conciliação" + mensagem | — | — | — |
| 1. KPIs | "Total de SKUs" | contagem com `xpm_total > 0` | `vw_xpm_estoque_conciliacao_api` (`select *`, order sku) | — | Gestão |
| | "Unidades na XPM" | Σ `xpm_total` | idem | — | Gestão |
| | "SKUs conciliados" | `status_conciliacao='ok'` | idem | — | Gestão |
| | "SKUs divergentes" (warning + ícone se > 0) | `='divergente'` | idem | — | Operação |
| | "Só no razão" | `='so_no_ledger'` | idem | — | Operação |
| 2. "Avarias — ainda por planilha" | Descrição | "A API da XPM não expõe avarias: o endpoint MovimentoAvaria retorna vazio e a posição de estoque traz apenas itens liberados…" | — | — | Integração |
| | Input data "Data do snapshot" (padrão `hojeISO()`) + "Arquivo (.xls)" (.xls/.html/.htm) | — | — | — | Operação |
| | Botão "Importar estoque" | — | parse no front (HTML ISO-8859-1, tabelas de 9 colunas, ignora linhas "TOTAL"; rodapé "TOTAL GERAL / NORMAL GERAL / DANIFICADO GERAL") | RPC `ingerir_estoque_xpm`(p_data, p_arquivo, p_rows, p_total_declarado, p_total_normal, p_total_danificado); invalida a conciliação | Operação |
| | Resultado | "Snapshot de {data_snapshot} salvo — N linhas"; "Normal: X · Danificado: Y"; destructive "N SKUs no armazém não existem no cadastro SNCF" (se `skus_fora_do_catalogo > 0`); warning "Rodapé do arquivo não reconhecido — importado sem conferência de totais" (se `validado_contra_rodape=false`) | retorno da RPC | — | Operação |
| 3. "Detalhe por SKU" | Busca "Buscar por SKU ou nome…" | sku, nome_comercial | — | filtro local | Operação |
| | Select status: Todos os status / OK / Divergente / Só na XPM / Só no razão | `status_conciliacao` | — | filtro local | Operação |
| | Tabela (limitada a 500 linhas + aviso "Exibindo 500 de N linhas. Refine a busca ou o filtro."; vazio: "Nenhum registro.") | ordenada por \|diferenca\| desc | conciliação | — | Operação |
| 4. "Histórico da posição" | Descrição | "N posições disponíveis, de X a Y." / "Nenhuma posição sincronizada ainda." | `xpm_estoque_posicao` (`data_hora_posicao`, order desc, limit 2000, distinct no front) | — | Integração |
| | Select de posição (a atual recebe "(mais recente)") | — | — | grava `posicao` na URL | Gestão |
| | Tabela (só aparece se a posição escolhida ≠ a mais recente; limite de 500; vazio: "Nenhuma linha nessa posição.") | — | `xpm_estoque_posicao` (sku, descricao, quantidade, situacao_estoque, lote) where `data_hora_posicao`=escolhida | — | Gestão |

Colunas — Detalhe por SKU: Código (`CodProduto(sku)` + ícone PackageX destructive se `existe_no_catalogo=false`) · Nome comercial (`nome_comercial ?? descricao_xpm ?? "sem nome"`) · Grupo (`grupo`) · XPM (`xpm_total`) · Razão SNCF (`saldo_ledger_sncf`) · Diferença (`diferenca`: < 0 destructive, > 0 success, 0 muted) · Status (Badge). Os campos `linha`, `colecao`, `xpm_liberado` e `xpm_outras` são carregados mas não aparecem na tela.
Colunas — Histórico: Código (`sku`) · Descrição · Situação (`situacao_estoque`) · Lote · Quantidade.

Regra do `status_conciliacao` (definida na view): sem SKU na XPM → `so_no_ledger`; sem SKU no razão → `so_na_xpm`; `xpm_total = saldo` → `ok`; senão → `divergente`. Badges: OK outline · Divergente destructive · Só na XPM secondary · Só no razão secondary. `diferenca = xpm_total − saldo_ledger_sncf`.

---

## 5. Aba Importar fases — `ImportarFasesXpm.tsx`

Nenhum estado vai para a URL. O cabeçalho do código avisa que a aba **não toca** em `xpm_expedicao_evento`, `wns_fases_xpm` nem `fn_xpm_aplicar_evento`.

| Bloco/seção | Elemento | O que mostra | Fonte | Ação | Público |
|---|---|---|---|---|---|
| Entrada | Título + Selo info | "Importar fases (arquivo XPM)" / "Fonte alternativa enquanto o trilho de eventos da API ZenLOG está quebrado…" / selo "trilho paralelo" | — | — | Integração |
| | Textarea | "Cole aqui o HTML completo do e-mail…" | — | — | Integração |
| | Botão "Subir .html" (.html/.htm/.txt) | — | — | lê o arquivo para dentro da textarea | Integração |
| | Botão "Ler e montar prévia" | — | parse no front: tabela com PEDIDO/STATUSNF/IMPORTADOEM/SEPARADOEM/CONFERIDOEM/FATURADOEM; "Data de geração" (12h desempatada pela hora do assunto "Tempos Pedidos … - HH:MM"); "Número de envio" | lê `xpm_arquivo_fase_dim.codigo` e `xpm_expedicao.codigo` (`in`, em lotes de 200) | Integração |
| | Botão "Nova importação" | — | — | limpa a tela | — |
| | Erros (destructive) | "Cole o HTML…", "Nenhuma tabela com as colunas PEDIDO/STATUSNF…", "Colunas faltantes…", "A tabela foi encontrada, mas nenhuma linha…", "Não achei o cabeçalho \"Data de geração: ...\"…" | — | — | — |
| Prévia | Selos | "N linha(s) lida(s)" (info); "gerado em …" (muted); "envio nº N" (muted) ou "número de envio não encontrado" (warning); "N data(s) inválida(s) — serão gravadas vazias" (warning) | — | — | Integração |
| | Alerta destructive | "STATUSNF fora do dicionário" + lista | statusnf ∉ `xpm_arquivo_fase_dim` | — | Integração |
| | Alerta neutro | "N pedido(s) nunca vistos na expedição XPM" — "Não é bloqueante…" | pedido ∉ `xpm_expedicao` | — | Integração |
| | Tabela Pedido / STATUSNF / Importado / Separado / Conferido / Faturado / (selo) | valores do parse; linha destructive/10 + selo "fase?" quando a fase é desconhecida; warning/10 + selo "novo" quando o pedido nunca foi visto | — | — | Integração |
| | Botão "Confirmar importação" | — | — | RPC `fn_ingerir_fases_arquivo_xpm`(p_linhas, p_arquivo_gerado_em, p_arquivo_numero_envio); toast "N linha(s) ingerida(s) no log de fases." | Integração |
| Resultado | Título "Importação concluída" + selos "N inserida(s)" (success), "N linha(s) no arquivo" | retorno `inseridos`, `total_linhas` | — | Integração |
| | Alerta destructive "N linha(s) ignorada(s) — fase desconhecida" | `fase_desconhecida[]` | — | Integração |
| | Alerta neutro "N pedido(s) não resolvidos na expedição XPM" | `nao_resolvidos_na_xpm_expedicao[]` | — | Integração |
| | Alerta warning "N retrocesso(s) de fase neste lote" — "Esperado — não é erro de importação…" | `retrocessos_detectados[]` | — | Integração |
| | Botão "Nova importação" | — | — | limpa | — |

Usa o componente `Selo` (`@/components/ui/selo`), `formatError` e `cn`.

---

## 6. Aba Funil API × Arquivo — `ComparativoFontesXpm.tsx`

Carrega uma única vez com `useEffect` (não usa react-query, então fica fora do refetch automático). Estado na URL com o prefixo `cmp` (busca, soApi, soArquivo).

| Bloco/seção | Elemento | O que mostra | Fonte | Ação | Público |
|---|---|---|---|---|---|
| Cabeçalho | Título + Selo info | "Funil (API x Arquivo)" / "Comparação visual entre a API ZenLOG (automática) e o arquivo do Leandro (manual)…seq 1–6…ordem 5–80…" / selo "comparação visual" | — | — | Integração |
| Filtros | Busca "Buscar pedido ou cliente…" | expedicao_codigo, pedido_sncf, cliente_sncf | `vw_xpm_comparativo_fontes` (16 colunas, order `api_dias_parado desc`) | filtro local | Integração |
| | Switch "Só API (N)" | `so_na_api` | — | inclui essas linhas | Integração |
| | Switch "Só arquivo (N)" | `so_no_arquivo` | — | inclui essas linhas | Integração |
| Contagem | Selos | "N com ambas as fontes" (success), "N total" (muted), "filtro padrão: ambas as fontes" (info, quando os dois switches estão desligados) | — | — | Integração |
| Erro | texto destructive | `formatError` | — | — | — |
| Tabela | (vazia: "Nenhuma linha encontrada para os filtros atuais."; carregando: "Carregando comparativo…") | — | — | — | Integração |

Filtro padrão: só aparecem as linhas que têm ambas as fontes. As linhas "só API" e "só arquivo" só aparecem quando o switch correspondente está ligado.

Colunas: Pedido / Cliente (`expedicao_codigo`, "SNCF: {pedido_sncf}", `cliente_sncf`) · Situação (Selo muted `situacao`) · Fase pela API (`api_fase_rotulo`, "há Nd" a partir de `api_dias_parado` ou `api_atualizado_em`, data `api_atualizado_em`) · Fase pelo arquivo (`arquivo_fase_rotulo`, `arquivo_atualizado_em`, "fat. {arquivo_faturadoem}") · Observação (Selo warning "sem dado do arquivo ainda" se `so_na_api`; Selo info "não aparece na API" se `so_no_arquivo`). Os campos `api_fase_codigo`, `api_fase_seq`, `arquivo_fase_codigo` e `arquivo_fase_ordem` são carregados mas não aparecem na tela.

---

## 7. Compartilhado — `AlertaDivergencia.tsx` (usado em Expedições e Painel)

- Fonte: `vw_xpm_divergencia_estagio` `select *` ordenada por `horas_desde_evento desc`, com refetch a cada 5 min (chave `xpm-divergencia`). Se não houver linhas, não renderiza nada.
- Card destructive com o título "Divergência de estágio" e o texto "A XPM registrou embarque ou expedição, mas o pedido não avançou no SNCF. Isso indica falha na integração."
- Colunas: Pedido (`pedido` = `pedidos.id_externo`; linha 2 `expedicao_codigo` · "NF {nf_numero}") · Cliente (`cliente` = `parceiros_comerciais.razao_social`) · Estágio no SNCF (Badge destructive `estagio_sncf`) · Último evento XPM (`ultimo_evento_xpm`) · Horas desde o evento (`horas_desde_evento`).
- Regra da view: considera as expedições com `obs_expedicao` no formato 'Pedido X via SNCF' e não suprimidas, ligadas a `pedido_remessa` e `pedidos` (`id_externo/NN`); precisam ter evento 8 (embarcado) ou 9 (expedido) com quantidade > 0; o pedido não pode estar cancelado nem em `em_transporte`/`entregue`. A coluna `motivo` existe na view mas **não aparece** na tela.
- Público: Integração.

## 8. Compartilhado — `FunilFases.tsx` (usado em Expedições, clicável, e Painel, sem clique)

- Fonte: `vw_xpm_risco_atraso` `select estagio_seq, fase_seq, quantidade_volumes, farol` com `limit 2000` (chave `xpm-funil-fases`, staleTime de 3 min). **Não aplica filtro de período nem de situação.**
- Seis caixas com rótulos fixos no código: Solicitado, Separado, Conferido, Nota Fiscal, Embarcado, Expedido. Cada caixa mostra o nome da fase, os "parados aqui" (`fase_seq = n`; "—" quando é 0) e "N passaram" (`fase_seq >= n`).
- Cores: caixa ativa → primary/20; com parados → primary/10; sem parados → fundo neutro. Ponto warning quando alguma expedição parada na fase tem `farol` atencao ou risco. `volumes_parados` é calculado mas não aparece.
- Nota: "Fase mais avançada entre a API da XPM e o relatório do armazém. Cinza = etapa iniciada e ainda não concluída." (o texto fala em "cinza", mas o funil não pinta nenhuma caixa de cinza; esse tom existe só no Semáforo da tabela de Expedições).

## 9. Hooks e utilitários usados

`useAbaUrl` (`src/hooks`), `useEstadoTela` / `resolverAcao` (`@/lib/navegacao`), `usePodeVerAba` / `AbaPermitida` / `ConteudoAba` (`@/components/AbaGate`), `CodProduto` (`@/components/produto/CodProduto`), `PainelSyncEstoque` (`@/components/acervo`), `PageShell` / `PageHeader` (`@/components/layout`), `Selo` (`@/components/ui/selo`), `formatError` (`@/lib/format-error`), `hojeISO` (`@/lib/data`), além de shadcn (Card, Table, Badge, Select, Dialog, Tooltip, Switch, Checkbox, Skeleton). Nenhuma aba usa `KpiPill` nem `SortableTableHead`; os KPIs são todos Card montado à mão.

---

## Fontes referenciadas (nomes exatos, sem duplicar)

**Views:** `vw_xpm_risco_atraso` (que deriva de `vw_xpm_ciclo` e `vw_xpm_arquivo_fase_traduzida`), `vw_xpm_divergencia_estagio`, `vw_xpm_cad_item`, `vw_xpm_estoque_conciliacao_api`, `vw_xpm_comparativo_fontes`, `vw_estoque_sync_status`.

**Tabelas lidas ou gravadas direto:** `wns_fases_xpm`, `xpm_motivo_pausa`, `xpm_expedicao_pausa` (insert e update direto), `xpm_expedicao_item`, `xpm_expedicao_evento`, `xpm_expedicao`, `xpm_arquivo_fase_dim`, `xpm_estoque_posicao`, `centro_distribuicao`.

**RPCs:** `ingerir_estoque_xpm`, `fn_ingerir_fases_arquivo_xpm`.

**Edges:** `zenlog-sync-expedicoes`, `zenlog-sync-estoque`, `gerar-planilha-xpm`, `ingerir-termo-xpm`, `pesos-produto`.

## Tamanho dos arquivos (linhas)

| Arquivo | Linhas |
|---|---|
| ExpedicoesXpm.tsx | 1193 |
| PainelXpm.tsx | 800 |
| EstoqueXpm.tsx | 685 |
| RecebimentoXpm.tsx | 625 |
| ImportarFasesXpm.tsx | 493 |
| ComparativoFontesXpm.tsx | 260 |
| FunilFases.tsx | 136 |
| AlertaDivergencia.tsx | 107 |
| XpmIndex.tsx | 107 |
| src/components/acervo/PainelSyncEstoque.tsx | 79 |

## Pontos de atenção para a reforma (fatos, não proposta)

1. Pausar e Retomar gravam direto na tabela, sem RPC e sem registro em `acao_superficie`.
2. Os rótulos das abas, das fases, dos estágios, das faixas e dos sistemas de sync estão fixos no código.
3. Três abas usam o slug `tela.wms_expedicoes`.
4. O recorte muda conforme o bloco: o funil não tem período, o Risco e a Tendência do Painel usam todas as linhas, e o resto usa o período escolhido.
5. O período do Painel fica em estado local, fora da URL.
6. O centro padrão "XPM-SC" está fixo no código.
7. O Comparativo não usa react-query, então fica fora da rede de atualização automática.
