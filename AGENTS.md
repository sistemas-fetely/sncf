# Decisões técnicas

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
