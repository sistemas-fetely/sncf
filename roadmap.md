# Roadmap
- [x] Balcão: declaração de pagamento e modos por tipo de CD; 10 testes passaram, seis chamadas locais com 1 item confirmaram os modos usando tabelas reais; sem criar pedido, gravar cotação ou publicar.
- [ ] Balcão: cálculo real dos valores nos três cenários bloqueado por permission denied for function fn_vd_calcular na conexão de leitura; edge não implantada conforme pedido, cotações simuladas.
- [x] Despesas: aba Custo obrigatório com leitura tipada e marcações protegidas; 9 testes novos + 6 da rotina, lint sem erros (aviso antigo preservado), portão e build OK. Preview autenticado: 20 sugestões reais, filtros/recarga e tabela 1280/1024 sem overflow; confirmação, edição, remoção, inclusão por família, retenção/selo, falta de permissão, espera e erros com respostas simuladas. Sem banco, escrita real ou publicação.
- [x] Despesas: primeira aba Hoje somente leitura via fn_contas_pagar_rotina; 6 testes/lint:gate/build OK, lint sem novos avisos. Preview autenticado conferiu dados reais, atualização, links, abas legadas/recarga, espera e erro simulado, 1280/1024 sem overflow; sem escrita/banco/publicação.
- [x] Filtros múltiplos nas sete telas: fontes/estado preservados, fases do catálogo pela dimensão, contagens cruzadas únicas; 46 testes e lint:gate passaram, lint dos arquivos sem novos avisos/erros (4 erros anteriores preservados), build OK. Preview autenticado verificou os 14 filtros: todas, desmarcar uma e recarga (Painel de Margem continua local); sem banco/publicação/gravações reais.
- [x] Comercial Site SP: aba somente leitura na Gestão, saldo compartilhado na busca/carrinho, coleções e filtros URL; 7 testes/lint novos/build OK. Preview autenticado: 662 SKUs/5.791 disponíveis, filtro/recarga e tabela 1280/1024 sem overflow, produto com 12 disponíveis e produto zero selecionados sem bloquear; sem criar pedido, banco ou publicação. Lint das páginas antigas mantém erros anteriores.
- [x] Cockpit: filtros múltiplos de grupo/coleção com contagens por produto; 5 testes e lint dos novos arquivos/build OK, 6 erros de lint anteriores da tela preservados. Preview autenticado conferiu busca, múltiplas seleções, limpar, recarga, totais e barra de 40px em 1280/1024; tabela mantém overflow anterior em 1024, sem alteração fora dos filtros, banco ou publicação.
- [x] Pacote contador: slots de pagamentos por conta/mês, resumos compartilhados NF-e/CT-e/NFS-e, subpastas e manifesto. 51 testes contábeis + 4 Deno passaram, typecheck/Deno check/build OK, lint sem erros; Itaú e upload março/2026 simulados conferidos em 1280/1024. Sem escrita real, implantação ou publicação.
- [x] Reembolsos da loja: aba somente leitura, query paginada compartilhada com contador, filtros/KPIs/XLSX e redirect; 7 testes/build OK, novos arquivos sem erros de lint (4 erros anteriores em App/Retorno preservados). Preview autenticado: 23 reais (9 com devolução/8 cancelados/6 sem devolução), filtros/reload, exportação e links ao funil/pedido/volta conferidos; tabela sem overflow em 1024px, sem banco/publicação.
- [x] Notas Fiscais fatia 3: tela/busca renomeadas e aba de devoluções/entradas com leitura paginada, filtros, tabela e XLSX; 16 testes/lint/build OK. Preview autenticado: 37 notas (24 Fetely/13 cliente), total R$ 124.025,12, filtros/reload, XLSX e links NF/pedido/volta conferidos em 1280/1024px; tabela sem scroll horizontal (overflow anterior da navegação global fora do escopo), sem banco/publicação.
- [x] Importador Safra Por Pagamentos: parser puro com detecção por aba/banco, CPF/DV e ocorrências, histórico/original/RPC integrados e Badge de lote nas visões existentes; 17 testes/typecheck/build OK, lint sem erros (16 avisos anteriores). Importador autenticado e 19 débitos/49 itens reais conferidos por fornecedor e lançamento, popovers sem overflow; importação e erro testados com arquivo sintético/gravações simuladas, sem banco/publicação ou conciliações reais.
- [x] Controladoria Fiscal: NF de retorno extraída para aba com permissão própria/contador e redirect; 6 testes e lint dos arquivos novos/build OK. Preview autenticado: 23 sugeridos, 3 confirmados, 1 descartado, diálogo total e link DEV-2318 ao funil conferidos; sem decisões gravadas, banco/publicação. Lint de App/RetornoDevolucao conserva 4 erros anteriores fora do escopo.
- [x] NFs de Venda fatia 2: alteração datetime documentada + sobreposição de 1 dia/cursor nulo, origens de parceiros corrigidas e aba/query/tabela compartilhadas; 26 Bun + 9 Vitest + 4 Deno, lint/check/build OK; 289 divergências reais (95/188/6), filtros/reload e tabela sem overflow a 1280/1024px conferidos; sem sync real, implantação de função, banco/publicação.
- [x] Chamados: variações obrigatórias/busca compartilhadas, edição no catálogo e assunto composto em lista/detalhe/pedido; 6 testes/build OK, catálogo real com 6 variações conferido, dois formulários verificados com resposta simulada (serviço NF errada inativo); sem gravação real, banco/publicação. Lint das listas/detalhe tem 8 erros visuais anteriores, mantidos fora do escopo.
- [x] Controladoria Extrato: fila/regras/pares unificadas, catálogos e RPCs existentes, histórico mensal e redirects; 5 testes/lint e build OK, preview autenticado com 605 movimentos/zero pares e diálogos conferidos; sem gravação real, banco/publicação.
- [x] NFs de Venda fatia 1: abas em Contabilidade, leitura fiscal completa (575 pedidos), filtros/restauração e redirects conferidos no preview autenticado; 6 testes e lint aprovados, sem banco/publicação.
- [x] Órfãos v2: aba guardada em Cobrança, redirecionamentos, fila em dois blocos, saída/desfazer e resolvidos; 6 testes e tipos aprovados, 17 créditos reais/3 prontos conferidos em 1280 e 1024px, filtros restaurados e saída/desfazer por confirmação e toast simulados; sem alterações de banco/publicação.
- [x] Espelhos externos: card no diff Bling sem novos GETs nem mudança de status por falha de espelho; Shopify atributos/inventory ampliados, 5 Vitest + 36 Bun e Deno check aprovados, duas edges implantadas; dry_run seguro via cron retornou HTTP200/8 páginas/395 produtos/913 variantes/zero erros, tabelas confirmadas 395/913 com exemplos custom.*; sem escrita externa/DDL.
- [x] Logística custo do frete: indicadores compartilhados, contas puras, filtro acima do teto e rodapé fixo filtrado; 39 testes/typecheck aprovados, Ícaro 78 documentos/47 acima do teto e Total (seleção existente Braspress) conferidos, totais 6.134,80/3.961,85/12.184,39 confirmados; sem banco/publicação.
- [x] Logística Período: análise pura, indicadores/gráfico/agrupamentos/atrasos, filtro UF na URL e coluna Dias; Ícaro 90 dias 65 entregues/5,1 dias/54 de 62/7 reentregas/0 devoluções e Total conferidos, UF sobrevive recarga, PED-2286 lido na gaveta; sem banco/publicação.
- [x] Marketplace estágios B2C: catálogo ativo/visível sem Recebido, ícones e desvios compartilhados, selo mantém regra idêntica B2C; Mesa/links/gaveta conferidos, 25 testes/typecheck aprovados e prints lado a lado a 1280px; sem SQL/publicação.
- [x] Logística Entregas: sub-abas na URL, consulta aberta paginada sem data, 10 testes e typecheck aprovados; preview todas 79/Ícaro 3, busca/filtros/Período e recarga conferidos; sem banco/publicação.
- [ ] Entregas detalhe real: drawer existente abre, mas fn_logistica_remessa_detalhe retorna statement timeout para PED-2354; banco/detalhe fora do escopo, leitura completa não validada.
- [x] Exportar campos por sistema: botão na Central, XLSX dinâmico paginado; 12 testes e download real (1205/934/1275) validados, falha de leitura sem arquivo parcial, sem banco/publicação.
- [ ] Exportação de campos: registrar censo da ação (MesaProduto.tsx + ExportarCamposPorSistemaButton.tsx) e slug acao.produto_exportar_campos_por_sistema; banco fora do escopo, acesso segue a guarda nominal com bypass existente de super_admin.
- [x] QZ fail-loud: resultado ok/erro com mensagem original e console; erro na aba e toast Mesa SP, preservando PDF; 7 testes passaram, preview autenticado e fallback ZPL→PDF com resposta Bling simulada conferidos sem gravação, sem publicar.
- [x] DEV-VINCULO-NO-PROCESSO: nascimento/view corrigidos; backup 30 vínculos, backfill 15 (DEV-2326 incluída), zero outros campos alterados e todos sugeridos; Fiscal/triagem validados autenticados com NF42515 parcial, aviso total e link; 13 testes passaram, sem publicação ou confirmação.
- [ ] DEV-2326 confirmação real e TRS: aguarda Flávio confirmar pelo card; nenhuma confirmação autorizada nesta tarefa.
- [x] QZ Integrações: aba própria com card e passo a passo; certificado/download independentes da conexão, seletor/teste só conectado; 6 testes passaram e preview autenticado desktop/mobile conferido com certificado simulado e download real, sem publicação.
- [x] Zebra QZ: preferred ZPL with PDF fallback, authenticated Vault certificate/signing edges, station selector and raw test. 26 Bun + 9 Vitest + crypto/5 extraction cases passed; Deno check/build OK; authenticated admin panel and ZPL→mark/PDF→manual confirmation verified with simulated QZ/responses, no real writes or printing, no deploy/publication.
- [ ] Zebra physical validation: requires deploying the reviewed functions, generating the certificate as authorized admin, installing QZ Tray/override.crt on the workstation and testing the real ZD220; no workstation is accessible in this sandbox. New action census/catalog registration must follow the authorized database front.
- [x] XPM 401/504: sessão renovada antes do envio e após 401, rede/corpo limitados por orçamento total de 110s (sem teto por etapa — Create real já levou 78s) com diagnóstico de etapa e sem repetição por timeout; typecheck/Deno check e PED-2378 conferidos sem envio real.
- [x] Marketplace visual B2C: PipelineFases e PedidoCanalDrawer compartilhados, cabeçalho/filtros/tabela/paginação B2C reutilizados; prints das filas/gavetas autenticadas em 1280 px conferidos, fase/busca/recarga/Portadores verificados, 13 testes passaram e build OK; sem banco/publicação.
- [x] Inner etapa A: arquivo atual validado em somente leitura, 1.242/1.242 corretas, nenhuma divergência; layout real cabeçalho 3/dados 5, coluna E.
- [x] Inner etapa B: execução a54e8a4a concluída em 928/928 (907 comparados, 21 sem vínculo); 440 itensPorCaixa aplicados, incluindo os 28 finais, zero erros/pendentes Inner; 2 CEST preservados pendentes. Escrita/automação false; nova leitura Bling confirmou VNRSL.FG.5.0 = 12, VELBASMED.LM.12/01588 = 24 e PRTJANGD.AG.26/01493 = 1; sem publicação.
- [x] Ajuste rastreio marketplace: situações Bling 8/1/3, descrição vazia e data zerada; 38 testes Bun + 5 casos Deno e Deno check passaram; redeploy confirmado somente de bling-marketplace-sync, sem banco/tela/publicação.
- [x] Bling envio aprovado: filtros SKU/campo, dimensões completas e vínculo pelo código real; 29 testes + Deno check, deploy só bling-produto-sync; três unidadeMedida aplicadas (21.2 × 6.9 × 3.1 preservados, 2 → 1), nova leitura Bling confirmou; escrita/automação false, 714 itensPorCaixa e 2 cest pendentes, sem publicação.
- [x] Marketplace reformulação: rota/fila/gaveta, portadores em dialog, campos B2C compartilhados e rastreio/objeto; testes e preview autenticado com pedidos reais conferidos, objeto real consultado sem gravar, edge redeploy, sem SQL/cron/publicação. Retorno real aguarda pedido em transporte/entregue (nenhum atual).
- [ ] Marketplace menu: falta nó /vendas/marketplace em sncf_navegacao; fn_nascer_tela deve registrar com tela.pedidos_marketplace, pai sops.operacao e ordem logo após Pedidos B2C (40). Banco fora do escopo; sidebar continua inteiramente via tabela.
- [ ] Bling diff recovery and corrections: reconstruct lost resolution, fix external-code lookup/unit comparison, test/deploy only bling-produto-sync and complete read-only diff; exact lost deployed source cannot be recovered with available tools.
- [x] Marketplace F3 frontend: aba na Loja B2C, filtros na URL, detalhe com retorno, transporte e portador padrão; 9 testes, pedidos reais e gravações simuladas conferidos, sem banco/publicação.
- [ ] Marketplace F3 permissões: catálogo não contém tela.pedidos_marketplace, acao.pedido_transporte_registrar ou acao.marketplace_transportadora_padrao_set, nem censo das ações; registro depende da frente de banco autorizada. Super Admin acessa pela regra existente; demais usuários dependem dos registros/concessões.
- [x] Recebimento físico na Chegada: KPIs, filtros, detalhe, e-mails e formulário movido; Cadastro XPM reduzido e porta xpm_email na edge. 20 testes, Deno check e deploy só da edge; TE-2026-0023 real conferido (274 linhas, 599.328 recebidas, 288 em falta), divergências primeiro e formulário disponível; sem ingestão real, banco/publicação.
- [x] Cadastro SNCF → Bling F1: cinco tabelas, RPCs/trigger/fila, edge isolada diff/PATCH e painel em Destinos › Bling; 12 testes, Deno check e diff real concluído (928 ativos, 894 tentativas, 57 produtos/68 campos divergentes, 837 erros Bling, 34 sem vínculo, 36 sem peso/dimensão). Escrita e automação desligadas; nenhum aplicar executado, sem publicar.
- [x] Mesa SP marketplace: PDF primeiro na edge com ZIP extraído, ZPL só diagnóstico; janela de impressão, confirmação, anotação e marcação. 27 testes, Deno check e deploy; ML-0001 real retornou PDF; botão/janela/confirmar conferidos com estação e documento simulados, sem marcar documento ou gravar evento. Impressão física não verificada; sem banco/publicação.
- [x] Mesa SP: listas confirmadas no banco; referência só quando executor exige, rótulos VD pelo catálogo, caixa/Correios por capacidade e ação genérica para documentos novos; lote mantém RPC atual e não omite executores. 38 testes passaram, build OK; preview autenticado com dados reais e transições/gravações simuladas conferido em desktop/celular, sem banco/publicação.
- [x] Bling marketplace: códigos TIK/ML/SPE e etiqueta ZPL/PDF com fallback somente em 400, formato_usado e objetos_erro preservado; 15 testes passaram e redeploy confirmado, sem banco.
- [x] Dimensões automáticas por equivalência estrita: edge implantada, bloco manual removido e contador por leitura; 79 testes passaram. Leitura 35f71563 reprocessada pela aplicação existente: 131 células aplicadas, 30 cadastros; 15 incompatibilidades e 8 conflitos preservados. Preview autenticado conferido; sem migration ou publicação do frontend.
- [x] Recebimento XPM por e-mail: termo@ encaminhado à nova edge HTML com Vault, RPC existente e log idempotente de sucesso/erro; 7 testes passaram, Deno check e deploy das duas edges confirmados, sem SQL/UI ou alteração do upload XLSX. E-mail real ainda não exercitado (nenhum resend_email_id fornecido).
- [x] DEV-TRS-NF-CLIENTE: migration 0090 aplicada, vínculo comercial confirmado como lastro por devolução/NF original e disparo protegido; Fiscal/checklist conferidos com leitura simulada autenticada, 9 testes front e SQL isolado passaram. Retroativo SELECT: 0 B2B com vínculo confirmado sem TRS que exigem transferência. DEV-2326/NF 42515 segue sugerida e sem TRS; confirmação real reservada ao Flávio. Sem edges/publicação.
- [x] DEV-BIPE-DUN ajuste: inner >= 1 conta direto (inclui 1); nulo ou <= 0 pede unidades; memória/AGENTS/documentação atualizados; 32 testes passaram e build OK. Preview autenticado DEV-B2C-1455: DUN 01833 × 3 contou 3 unidades com origem "DUN · 1 cx = 1 un", sem prompt; inner nulo focou Unidades e somou 7 explícitas. Sem registrar retorno, banco, edge ou publicação.
- [x] BIPE-GTIN-NORMALIZADO: resolver GTIN-14 único com cache paginado e mapas em memória; devolução/Mesa/estoque/transferências/importação migrados. 45 testes passaram; DEV-B2C-1455 e Inventário reais conferidos com UPC/EAN/DUN 01833, foco para inner=1 e inexistente recusado. Sem registrar contagem/retorno, banco, edges ou publicação; inventário de telas em docs/bi-pe-gtin-normalizado.md.
- [x] UF-SIGLA: migration 0089 aplicada (hash conferido no banco), funções idênticas e trigger ativo; UPDATE Rio Grande do Sul retornou RS com ROLLBACK. Rotinas revisadas sem formato extra; sem alterar frontend/edges ou publicar.
- [x] DEV-BIPE-DUN: resolução front por DUN + inner_qtd vinculado pelo DUN; 18 testes passaram. Preview autenticado: 3 caixas × 6 = 18 unidades; inner nulo pede foco/unidades (7); inner 1 simulado pede total explícito (5, não 3×5); EAN soma 1; fora da devolução em unidades e celular conferidos. Sem registrar retorno, banco, edge ou publicação.
- [x] Mesa SP: troca individual volta a Documentos, guarda/marcações por ciclo do modal no banco, agência explícita e aviso CC-e; 32 testes passaram. PED-2402 trocado realmente para CORREIOS pela tela e documentos antigos descartados; função de troca, edge e lote intactos; sem publicar.
- [x] Mesa SP PED-2402: etiqueta PAC AP722233377BR gerada realmente na tela de Documentos com UF RS, caixa N30 / 1.729 kg e cartão SP; status rotulo_impresso, reimpressão e evento conferidos após recarga. Sem cancelar etiqueta, despachar ou publicar.
- [x] Catálogo: fechamento antes do limite adaptativo restaurado, fronteiras/reenvio/parada conferidos e AGENTS.md incluído; 80 testes passaram. Com 904 células em produtos de 4: 11 lotes adaptativos (limite 91), ou 10 com limite explícito 100; sem banco, edge ou publicação.
- [x] Órfãos de Entrada: sugestão por pedido/valor/data e atualização aguardada de pedidos/provas após aceite; 3 testes e aceite autenticado simulado conferidos, sem banco, tipos gerados ou publicação.
- [x] Catálogo: lotes adaptativos por produto e 100% visível por 600 ms; 35 testes passaram e fluxo autenticado de 16 células conferido com aplicação simulada, sem banco, edge ou publicação.
- [x] Mesa SP: instrução em todas as estações, leitura obrigatória antes de conferir/embalar e edição no pedido/VD; 25 testes, leitura/edição autenticadas com respostas simuladas e celular conferidos; sem gravações reais, banco ou publicação.
- [x] Condições de pagamento: cadastro rápido exclusivo do Super Admin, prévia real e validação conferidas, salvamento/reativação por Enter e recarga simulados no celular, 18 testes; tipos regenerados, sem SQL, cadastro real ou publicação.
- [x] Catálogo: cadastro confirmado de dimensões novas no FOP, agrupamento, semelhantes e aplicação/descarte por grupo; 38 testes, Deno check e fluxo autenticado com respostas simuladas, sem cadastro/descarte real, SQL ou publicação.
- [ ] Dimensões FOP: conferir função hospedada e disponibilidade da nova rota do FOP (consulta de validação retornou 404; cadastro real não executado).
- [x] Catálogo: aplicação frontal em lotes por produto, modal protegido, progresso, pausa/reenvio e resumo; 35 testes e fluxo autenticado simulado (pausa, repetição do lote, erro isolado, 409, parar e celular), sem aplicação real, edge, banco ou publicação.
- [x] Catálogo: lease renovável de 5 min, retentativa automática limitada à espera, aviso 409 e erros agrupados; 90 testes, tela autenticada com 409 simulado e duas edges reimplantadas; sem aplicar células reais ou publicar frontend.
- [x] Central do Produto: cinco abas com busca traduzida, Cockpit no BI e links antigos para Mesa; 33 testes, navegação autenticada e Mesa 01888 conferidos; BI abre com aviso de rota ainda não cadastrada, menu/banco ficam para a conexão antes da publicação; sem banco/publicação.
- [x] Repor SP: filtros na URL, ordenação, agrupamento e seleção preservada; 27 testes passaram, abas/filtros restaurados e 1 SKU/4 kits fora do filtro chegaram à Nova transferência; sem banco/publicação/TRS real.
- [x] Inventário: validade pelo parâmetro, pendentes e contados no prazo; 14 testes, listas reais e pós-registro simulado conferidos, sem registro real/banco/publicação.
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
