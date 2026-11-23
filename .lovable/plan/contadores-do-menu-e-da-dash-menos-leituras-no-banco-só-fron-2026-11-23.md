# Contadores do menu e da Dash: menos leituras no banco (só front)

## Onde as funções são chamadas hoje
- `fn_badges` — só em `src/hooks/useBadgesNavegacao.ts` (chave `["badges-navegacao"]`), usado por `src/components/vendas/VendasSidebar.tsx`.
- `fn_inbox_filas` — só em `src/hooks/tarefas/useInboxFilas.ts` (chave `["tarefas","inbox-filas"]`), usado por `src/components/tarefas/InboxFilas.tsx` (Dash).

## Problemas encontrados
- Badges já estão fora da rede de segurança (`meta.pesada`), mas refazem a leitura ao voltar para a aba do navegador.
- Filas da Dash **não** estão marcadas como pesadas: qualquer salvar em qualquer tela as relê. Além disso, a chave começa com `"tarefas"`, então as ~20 invalidações `["tarefas"]` dos hooks de tarefa também as relêem.
- Já existe uma única chave por função e um único hook — não há chamadas duplicadas na montagem; a mudança mantém isso centralizando as chaves numa constante exportada.

## Diff proposto

```diff
--- src/hooks/useBadgesNavegacao.ts
+export const KEY_BADGES_NAVEGACAO = ["badges-navegacao"] as const;
+
 export function useBadgesNavegacao() {
   return useQuery({
-    queryKey: ["badges-navegacao"],
+    queryKey: KEY_BADGES_NAVEGACAO,
     meta: { pesada: true },
-    staleTime: 60 * 1000,
+    // fn_badges lê cache atualizado a cada 2 min no banco
+    staleTime: 60_000,
+    refetchOnWindowFocus: false,
+    refetchInterval: 120_000,
```

```diff
--- src/hooks/tarefas/useInboxFilas.ts
+// Chave fora do prefixo "tarefas": invalidações de tarefa não releem as filas.
+export const KEY_INBOX_FILAS = ["inbox-filas"] as const;
+
 export function useInboxFilas() {
   return useQuery({
-    queryKey: ["tarefas", "inbox-filas"],
-    staleTime: 2 * 60 * 1000,
-    refetchInterval: 5 * 60 * 1000,
+    queryKey: KEY_INBOX_FILAS,
+    // fora da rede de segurança: contagem vem de cache do banco (2 min)
+    meta: { pesada: true },
+    staleTime: 60_000,
+    refetchOnWindowFocus: false,
+    refetchInterval: 120_000,
```

- O botão "atualizar" manual da Dash (`refetch`) continua funcionando.
- `refetchInterval` dos badges: hoje não há polling; proponho 120 s para o menu acompanhar o cache do banco sem depender de mutação. Se preferir sem polling, fica só staleTime 60 s.

## Outros passos
- Regenerar os tipos do banco (nova tabela `filas_contagem_cache`).
- Teste pequeno em `src/test/redeSeguranca.test.ts` (ou novo ao lado dos hooks): as duas queries têm `meta.pesada` e a chave das filas não começa com `"tarefas"`.
- Registrar em `AGENTS.md`: contadores de menu/Dash são pesados, sem refetch por foco, polling ≥ 2 min.

Sem migration, sem mexer em process-email-queue, índices ou telas.
