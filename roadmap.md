# Roadmap
- [x] CORRIGIR-NF-V2: NF substituta em rascunho, estados/botão em Correções e filtro VD; 23 testes, Deno check e fluxo autenticado com Bling simulado; sem SQL, publicação do frontend ou NF real.
- [x] Coleções novas na Entrada: confirmação humana, porta FOP sem implantação, equivalência/variantes, bloqueio individual/lote e 81 testes; conferência autenticada sem cadastro real/publicação.
- [ ] Coleções novas: implantar edge e registrar ação (SQL preparado em docs; aguardando autorização); cadastro real FOP não executado.
- [x] Separar Conciliação em Entrada/Saída por URL e link antigo; nomes da mesma leitura e valores novos; 57 testes e temas conferidos com dados reais, sem gravações/publicação.
- [x] Revisão diária Operações: produtos, rótulos da matriz, filtros/seleção por célula, resumos recolhidos e paginação; leitura real 235 produtos/770 células, NCM 172, prévia sem confirmar; sem aplicar/publicar.
- [x] Catálogo SharePoint F1: Microsoft 365/Vault, leitura/comparação, revisão Operações, ponte FOP, duas filas e cron 06:30; seis cenários fake e 11 testes, acesso inválido negado, produtos/base oficial intactos. Sem publicação.
- [ ] Catálogo oficial: testar conexão/arquivo Microsoft (bloqueado: credenciais reais ainda não fornecidas); rota da fila Produto aguarda tela FOP da F2.
- [x] Unificar fila operacional Central/Cockpit, alertas por SKU, ações e gaveta; contagens iguais, pré-carga 4 kits e filtros reais conferidos. Devolução alta = 0, sem ação real/TRS; sem SQL/publicação.
- [x] Reposição SP v2: Central/motor compartilhado, pré-carga e gaveta migradas; fretes via APIs existentes; 15 testes, painel 30 urgentes/286 carga, edição/pré-carga e PAC/SEDEX reais conferidos. Parâmetros sem seção de estoque (não criada). Sem SQL/publicação/TRS real; gravação do frete não executada.
- [x] Reformar documento externo do representante: vendas por NF, comissão a receber e previsão sem atrasos; 19 testes passaram, Carine/Lucia/Everson 10/2026 e impressão A4 conferidos, sem banco/publicação.
- [x] Exibir número Bling no modal, lista, detalhe e etiqueta reversa; SHP-1467/823, DEV-B2C-1522/919 e cópia 851 conferidos no preview; 11 testes passaram, sem banco/publicação.
- [x] Pacote etapa 2 fase 1: aplicada, funções publicadas, 38 PDFs de NFS-e gerados, dry-run 10/2026 conferido. Aguardando o Flávio confirmar os pagamentos de 7915/7916.
- [x] Numeração compartilhada corrigida pela chave e deduplicada entre saídas/entradas próprias/devoluções; outubro conferido na tela e manifesto simulado: 8 buracos, 3 canceladas, 0 inutilizadas. NFs 697/732/921 como entrada própria; 5 testes passaram (3 reais). Sem remessa/publicação.
- [x] Casa 22 na DRE: aluguel/comissão como despesas por competência ligadas à CPR; MDR mensal só na 2.4, fora das despesas duplicadas. Outubro: 2.4 R$798,73→818,96; 7.3 R$0→87,62; 9.2 R$0→219,14. Refresh, reexecução igual e tela conferidos; 15 testes passaram, integridade sem novo alerta. Seletor de meses reparado (view inexistente). Snapshot sucessor aditivo, legado preservado. Zero/alerta e classificação posterior preservados no fluxo, sem teste destrutivo real; sem publicar.
- [x] PDFs série 2/Sublimity: importador aguarda o cache depois da RPC; retrofit de 10/2026 gerou 3/3 (000001, 000002, 000003), pdf_origem=gerado_xml, zero erros. PDFs baixados e resumo conferido; 4 testes fiscais e 11 do importador passaram. Sem remessa/publicação ou nova importação financeira real.
- [x] MP mensal: cron dia 1 às 06h BRT, coleta pela rotina horária existente; Gerar agora/outubro testado: 224 liberações, 01–31/10, arquivo R$ 4.966,91 → R$ 9.838,63, SNCF R$ 4.486,14 → R$ 9.357,86, diferenças R$ 480,77. Automático api_mp não vigente e manual preservado. Sem movimentos/remessa/publicação; primeira execução mensal agendada ainda não ocorreu.
- [x] Extratos do mês: registro versionado/RPC, leitura sem importar, cards, ZIP/manifesto e confirmação. Outubro validado com Account Statement: arquivo R$ 4.966,91 → R$ 9.838,63, SNCF R$ 4.486,14 → R$ 9.357,86; diferença R$ 480,77 em ambos. Itaú/Safra faltantes. Dry-run: bancário 2, XML entrada 1, NF cancelada 1, devolução 1, outros/PDF 3; 104 apoios sem original informativos. Substituição/download/light/dark/mobile conferidos; 9 testes passaram, 3.038 movimentos e 6 remessas inalterados; sem publicação/remessa.
- [x] Adaptar somente venda_fora ao processo contínuo: indicadores, vendas e contas do mês, estoque real e documentos; 11 testes passaram, Casa 22 real conferida (1.268 unidades também no saldo documental), WeConnect preservado; sem SQL/publicação. Nova importação real não executada.

- [x] Substituir aviso histórico da gaveta TI pelo saldo fiscal sadio atual da origem; painel sem dependência textual, 2 testes passaram, TI-0001 real sem negativos e aviso simulado com código/saldo conferidos no navegador; sem banco/publicação.

- [x] Confirmar escolha divergente e trocar CD pendente no B2C; 3 testes e build OK, confirmação real conferida, troca/aviso/erro simulados no navegador porque não há pedido pendente; sem alterar banco nem publicar.

- [x] Corrigir atualização e erros da coluna de pagamento; validar PED-2309 e typecheck sem banco/publicação.

- [x] M3: reunir abas e seletor de escopo da Logística, alinhar período e validar links e mobile sem banco/publicação.

- [x] Impedir que liquidação do CNAB regrade pedido já expedido: transição só com estágio aguardando_pagamento/cobranca, erro de transição logado sem abortar o arquivo; função publicada, Deno check passou.


- [x] Captação F5: links B2B nas três edges e card compartilhado conectado ao detalhe; PED-2287 conferido com Gerar PIX e sem cartão, 7 testes simulados e Deno check passaram, sem gerar link real.

- [x] Exibir candidatos e filtro na Casa dos Pedidos; PED-2116 entregue conferido com badge âmbar e R$ 523,73 no navegador; 3 testes passaram, sem banco/publicação.

- [x] Unificar nascimento por origem e reorganizar abas da Chegada; 8 testes e navegação/formulário conferidos no navegador, prévia interceptada sem nascimento real, sem banco/publicação.

- [x] Exibir a base de comissão nos três blocos do extrato e validar Lucia, Carine e Everson 10/2026, sem banco/publicação.

- [x] Incluir valor da parcela e taxa na agenda e atrasos; testar e conferir Lucia/Everson 10/2026 em A4, sem banco/publicação.

- [x] Completar carteira paga pendente e seleção do lote; preservar fechamento existente e rodar testes, sem banco ou publicação.
- [ ] Validar os quatro extratos de 10/2026 e PDFs no navegador (bloqueado: conexão do Lovable Cloud indisponível).

- [x] Reformular o extrato mensal com pagamento, origem, carteira, atrasos e ajustes.
- [x] Separar memória em anexo e validar extratos e PDFs A4 sem alterar banco ou publicar.

- [x] Reutilizar o popover explicativo do Cockpit na coluna Funil.
- [x] Validar Funil e Margem no navegador e executar o typecheck.
- [x] Substituir ações de concluir/reabrir pelo controle circular na ficha da tarefa.
- [x] Exibir o estado agregado de salvamento no peek e na página.
- [x] Ajustar o rodapé do peek e a legibilidade do selo do projeto.
- [x] Executar o typecheck sem publicar.
- [x] Paginar todas as RPCs do Fechamento Mensal sem truncamento.
- [x] Refazer o export Evolução Mensal CFO em ExcelJS com trava de conferência.
- [x] Validar contagens, arquivo, recusa por divergência, estilos e erros no navegador.
- [x] Aplicar rolagem interna e cabeçalhos congelados às cinco tabelas de Importar PI.
- [x] Paginar Conferência, Efetivação e Nascer no FOP acima de 50 linhas.
- [x] Executar o typecheck sem publicar.
- [x] Adicionar seleção de produtos filtrados na Mesa do Produto.
- [x] Criar promoção de fase em lote com progresso e falhas nomeadas.
- [x] Encadear sucessos promovidos a Ativo com o fluxo existente do Bling.
- [x] Validar seleção, atalhos, permissões, typecheck e build.
- [x] Mover observações da venda direta para observações internas no envio ao Bling e validar com Deno.
- [x] Corrigir no Bling o nome do contato da venda direta encontrado pelo CPF, com bloqueio em falha.
- [x] F1 exportar planilha de cadastro (catálogo inteiro, sem seletor de coleções).
- [x] Reprocessar produtos: contar "linhas sem destino" (sem SKU + SKU fora dos pedidos do embarque).
- [x] Incluir memória de cálculo por NF nos extratos individual e em lote.
- [x] Enxugar o Gerencial em tela e PDF, mantendo comparativo, conta corrente e representantes.
- [x] Validar Lucia 10/2026, Anne 11/2026, lote 10/2026 e Gerencial 09/2026 sem publicar.
- [x] Coluna Classificação, filtro padrão e aviso na aba "NFs sem pedido"; corrigir a quebra da tela durante o carregamento.
- [x] Tirar a proteção de aba da planilha de cadastro (aba "cadastro" e "Banco GS1"), mantendo cinza, listas, freeze e filtro.
- [x] Datas do ciclo no painel do consignado: "Fechamento dia X · Pagamento dia Y", com fechamento nulo mostrando só o pagamento; WeConnect e Utilplast conferidos no navegador, typecheck e build ok.
- [ ] Campo "Dia de fechamento" no cadastro do parceiro (bloqueado: consignado_dia_acerto não é editável em nenhuma tela hoje; definir onde os dois campos devem ficar).

- [x] Um botão por estado em aguardando_pagamento: confirmar só com linha em aberto, descer só sem portão aberto; PED-2338 conferido no navegador nos dois estados, sem banco/publicação.

- [x] Esconder venda fora (Casa 22) do painel de Transferências, com chip para trazê-las de volta e selo "Remessa 5904: NF ..." na coluna NF; PED-2283/PED-2193 conferidos no navegador, sem banco/publicação.

## Pacote do Contador v2
- [x] Fase 1 · Bloco 1: original bancário guardado em toda importação + "Anexar arquivo original"
- [x] Fase 1 · Bloco 2: XML das NFs de saída de 11/2026 guardado (botão "Buscar arquivos das NFs do mês")
- [ ] Bloco 2: PDF (DANFE) — Bling responde 403 no download; investigar
- [ ] Bloco 2: cópia automática no sync (sync-nfe / vd-nf-sync), NF de entrada (sync-qive-dfe), cancelamento/CC-e
- [ ] Fase 2 · Blocos 3 e 4: pacote em segundo plano (ZIP + manifesto), versões, novo link, e-mail

## Pacote do Contador v2 — complementos Fase 1
- [x] PDF 403 do Bling (investigar nf-download / gerar DANFE do XML) + retrofit 11/2026 com incluir_falhas
- [x] Retrofit NFs de saída 10/2026 e reportar números
- [x] Importação "Guardar sem ler" para formato não reconhecido
- [x] Cópia automática no sync (sync-nfe, vd-nf-sync, sync-qive-dfe entrada)
- [x] Testar XML de evento cancelamento/CC-e na API v3
- [ ] Mercado Pago Fase 1 (aguardando aprovação do plano)

- [x] Devoluções: sem reembolso na loja não é divergência (função + bloco Financeiro + botão nunca grava declaração vazia); sem publicação.
- [x] Diagnóstico DEV-B2C-1401: consulta só leitura ao Bling (edge temporária removida)
- [x] DEV-NF-VERIFICA-AUTO: regra única, botão com resultado fixo, cron 15 min, 1ª rodada
- [x] Pacote do Contador v2 Fase 2 (blocos 3 e 4)
- [x] Mesa SP: trocar PAC↔SEDEX na etiqueta Correios (seletor, motivo, edge, evento, funções do banco).
