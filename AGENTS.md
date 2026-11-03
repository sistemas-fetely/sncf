# Decisões técnicas

- TI drawer stock warnings query the origin's signed fiscal_sadio for the transfer SKUs and use the tested saldoOrigemTi selector; refresh on opening and while open so historical observation text never determines current stock status.

- Keep B2C CD confirmation and pending-swap form rules in a tested pure helper; read the comparison suggestion from the queue, keeping stock hints separate so they never change confirmation eligibility.

- Keep Logistics module tabs in the page shell and scope URL updates in a tested pure helper; carrier content receives the active tab to avoid duplicate navigation.

- Await the shared order invalidation after payment actions and handle payment edge errors through a shared response parser; stage changes must remove stale payment controls without unhandled rejections.

- Screen freshness is guaranteed by the QueryClient safety net (invalidate every query after any successful mutation, 30s staleTime, refetch on focus/reconnect), never by hand-listed invalidations; per-order helpers stay as the surgical path and must pass the order id so a key-position predicate can reach caches the lists do not cover.

- B2B SafraPay generation derives charges from open gate provisions; origin-specific permissions are checked after loading the order so Venda Direta access cannot authorize B2B charges.

- Fetch payment-candidate details only for visible page IDs under the grid query prefix; candidate filtering scans scoped order-ID blocks before visual pagination so old delivered orders cannot be lost.

- Resolve grouped Chegada tabs and legacy links through a tested pure selector; use separate query parameters for each subgroup to avoid embedded-tab collisions.

- Keep monthly statement selection/grouping in a pure tested helper; payment totals come from the closed statement, never recomputed from live receivables.
- Render individual and batch statements through the same single-page representative document so content and print remain consistent.

- Use `InfoMetrica` para popovers explicativos de cabeçalhos, inclusive conteúdo personalizado, para preservar um único padrão visual.
- Use `BotaoConcluir` como controle circular único de conclusão nas listas, no board e nas fichas, evitando ações com aparência de salvar.
- Generate separate statement PDFs by rendering each batch member off-screen in the current page (never an iframe — production hosting blocks framing), sharing `listarRepresentantesDoLote` with the batch print.
- Persist live Correios B2B quotes to `frete_cotacao` (one per order, update-then-insert because the unique index is partial) so the DB suggestion can read them; the front only highlights the DB winner and never re-implements eligibility rules.
- CNAB settlement only advances an order that is still in the collection queue: the return processor reads the current stage and skips the transition otherwise, and a failed transition is logged without aborting the file, because recording the bank fact must never depend on stage changes.
- Every Bling API call goes through `_shared/bling/bling-client.ts` (`blingHeaders` adds `enable-jwt: 1`); call-sites never fetch the Bling API directly, so JWT/auth changes live in one place.
- Every Bling sync that finds or creates a partner goes through `_shared/bling/parceiro-resolver.ts` (bling_id → CPF → CNPJ, oldest row, lookup errors throw), because `.maybeSingle()` on duplicate rows silently returned null and spawned new copies.
- Render product identifiers through `CodProduto` (cod_cadastro primary, sku secondary, resolved by `useCodigoProdutoMap`), so every screen shows the same code and unmapped SKUs are flagged visibly.
- Each external system (Bling, XPM, Shopify) has its own `varrer-divergencia-<sistema>` edge with the same lote/chain/detectar/corrigir shape, reading the destination from the system API; `produto_campo_destino` is the only source: `ativo` + `na_correcao` decide what is compared, `sobrescreve` decides what is written, so a new field never needs a code-side list.
- Card links for a receivable (renegotiation) are tied by `pagamento_link.titulo_id` and settle through `marcar_titulo_pago`, never through the order's gate; installment interest is computed by SNCF (`safrapay_taxa_parcelamento`, `renegociar_titulo_cartao`) and only amount + max installments go to SafraPay, because the link API has no interest parameter.
- Every externally shared link builds its origin through `publicUrl()` in `src/lib/urls.ts` (env → `fn_url_publica()` loaded once at boot → fallback), never `window.location.origin`, because the preview origin leaked into customer PIX links.
- Safra return effects on titulo_a_receber apply only to the current boleto (nosso_numero_seq, else nosso_numero_safra); baixa/rejeição of an older replaced boleto touches only titulo_boleto and the instrument log, and rejection classification comes from vw_safra_retorno_pendente.classificacao_rejeicao, because a stale baixa overwrote freshly registered boletos.
- Site SP order screens draw phase/step/owner/next action only from `vw_venda_direta_gestao` + `vd_fase`/`vd_etapa`/`vd_responsavel` (via `FunilVD`); `situacao` only drives actions, so classification lives in one place (the database).
- CD-swap eligibility in the fila comes only from `v_pedidos_fila.cd_pode_trocar`; the front never hardcodes a distribution-center code (no `SITE-SP` constant), because the rule of when a swap is allowed belongs to the database and can change without a deploy.


## TELA-LEMBRA-ONDE-EU-ESTAVA
- Navigation state (search, filters, sort, page, tab, focus) lives in the URL via `useEstadoTela` (`src/lib/navegacao`); defaults stay out of the URL.
- Preferences (page size, columns) are not navigation: they stay in `usePreferenciaTela`.
- Open details with `abrirDetalhe` (carries `state.from` with query + `foco`); go back with `SmartBackButton` — never blind `navigate(-1)` nor a hard-coded route.
- List rows carry `data-foco-id`; `useFocoAoVoltar` scrolls to and highlights the opened item on return.
- `useRestaurarScroll` restores list scroll per URL (sessionStorage, the one sanctioned exception).
- Every new screen is born with these pieces.
- Non-scalar list state (sort, sets, setState updaters) goes to the URL through `codecUrl` helpers, so every screen encodes them the same way.
- Checklist de tela nova: useEstadoTela (filtros), data-foco-id + useFocoAoVoltar + useRestaurarScroll (lista que abre rota), abrirDetalhe (abrir), SmartBackButton (voltar).
- Consignment model-2 NF complementary info (referenced NFs + PIX) is built only by `fn_consignado_obs_nf`; `enviar-pedido-bling` appends it to `observacoes` and refuses the send when it returns ok=false, so the text and its preconditions live in one place.
- Carrier price-table versions are created only by `fn_importar_tabela_preco_v2` (clone of the active version + replaced tariffs + copied CEP ranges, with a `p_simular` dry-run that rolls back); the before × after comparison comes from `fn_frete_estimado` inside that dry-run and spreadsheet parsing lives in the tested `src/lib/logistica/planilhaTabelaPreco.ts`, so freight rules are never duplicated in the front.
- Mesa SP Correios dispatch with "postagem na agência": the front cancels the live SNCF pre-posting through `correios-prepostagem` (via `substituirEtiquetaSeAgencia`, rule in tested `src/lib/logistica/postagemAgencia.ts`) before calling the dispatch RPCs; the DB lock against a divergent scan stays as the safety net for orders without the agency event.
- Bank imports upload the original file to the private `contabil` bucket (path anchored on the import id via `src/lib/contabil/arquivoOriginal.ts`) before parsing any line, then move it to the competência folder of `periodo_fim` (or the chosen competência) because the package selects by period, never by path; an xlsx only reaches a parser when `classificarXlsx` confirms its header (SNCF's own reports are refused before upload); unsupported formats become `arquivo_nao_lido`/`guardado` only through `fn_extrato_importacao_guardar_sem_ler`. NF XML/PDF copies go through `_shared/nf-cache-storage.ts`, called best-effort by the shared Bling NF sync and the retrofit (XML mandatory; PDF from Bling, else generated from the XML by `_shared/nfe-resumo-pdf.ts`, recorded in `pdf_origem`), because Bling's site rejects server-side PDF downloads.
- Devolution NF authorization checks (button and the devolucao-nf-verifica cron) share `_shared/devolucao/verificar-nf-dev.ts`, so the 5/6 → autorizada, 2/cancelled/404 → erro rule lives in one place.
- The accountant package is created only by `fn_remessa_contador_iniciar` (version = max+1; `fechado` → definitiva, `pre_fechado` → prévia, nature stored in `remessas_contador.natureza`) and zipped in the background by `gerar-pacote-contador-v2` (parts uploaded as they close, resume from `progresso.proxima`); links/e-mail go through `_shared/pacote-contador/remessa.ts`, so `gerar-pacote-contabil` is no longer called.
- Credentials go to the Vault only through fn_vault_gravar_segredo (permission acao.credenciais_integracao.gravar, value never returned, log without value), are listed by fn_vault_listar_segredos and are edited only in the per-system tabs of /ti/integracoes (one door per subject), because the operator has no dashboard access.
- get_vault_secret only executes as service_role/postgres; never call it from the user's client, because granting it to authenticated let any logged-in user read every secret.
- Devolution CD-transfer (TRS de retorno) is created only by fn_devolucao_criar_trs_retorno and its status read from vw_devolucao_trs_retorno; Bling send waits for naturezas_operacao.bling_natureza_id, so the fiscal rule lives in the database.
- Mesa SP Correios pickup is recorded from tracking: the first non-FC Correios event triggers `fn_mesa_sp_despachar_por_rastreio` (idempotent `mesa_despachado`, ator sistema/correios_rastreio), and the 30-min `mesa-sp-rastreio-coleta-30min` job queries only codes from `fn_mesa_sp_codigos_aguardando_coleta`, so live SNCF labels never need a manual scan.
