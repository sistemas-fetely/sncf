# Decisões técnicas

- B2B SafraPay generation derives charges from open gate provisions; origin-specific permissions are checked after loading the order so Venda Direta access cannot authorize B2B charges.

- Fetch payment-candidate details only for visible page IDs under the grid query prefix; candidate filtering scans scoped order-ID blocks before visual pagination so old delivered orders cannot be lost.

- Resolve grouped Chegada tabs and legacy links through a tested pure selector; use separate query parameters for each subgroup to avoid embedded-tab collisions.

- Keep monthly statement selection/grouping in a pure tested helper; payment totals come from the closed statement, never recomputed from live receivables.
- Render individual and batch statements through the same single-page representative document so content and print remain consistent.

- Use `InfoMetrica` para popovers explicativos de cabeçalhos, inclusive conteúdo personalizado, para preservar um único padrão visual.
- Use `BotaoConcluir` como controle circular único de conclusão nas listas, no board e nas fichas, evitando ações com aparência de salvar.
- Generate separate statement PDFs by rendering each batch member off-screen in the current page (never an iframe — production hosting blocks framing), sharing `listarRepresentantesDoLote` with the batch print.
- Persist live Correios B2B quotes to `frete_cotacao` (one per order, update-then-insert because the unique index is partial) so the DB suggestion can read them; the front only highlights the DB winner and never re-implements eligibility rules.
