# Decisões técnicas

- Keep monthly statement selection/grouping in a pure tested helper; payment totals come from the closed statement, never recomputed from live receivables.
- Render the statement and calculation appendix through the shared representative document for individual and batch views; print uses a separate always-visible appendix to preserve collapsed screen state.

- Use `InfoMetrica` para popovers explicativos de cabeçalhos, inclusive conteúdo personalizado, para preservar um único padrão visual.
- Use `BotaoConcluir` como controle circular único de conclusão nas listas, no board e nas fichas, evitando ações com aparência de salvar.
