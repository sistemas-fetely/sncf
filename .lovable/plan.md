# Diagnóstico — Itens "Integridade Financeira" e "Auditoria" invisíveis

> Investigação apenas. Sem propor correção.

## TL;DR

As rotas existem e o item **está** cadastrado no sidebar correto (`FinancasContextSidebar`, sem filtro de permissão). Duas descobertas importantes:

1. **`AdminFinanceiroSidebar` é código órfão** — nenhuma `<Route>` monta `AdminFinanceiroLayout`. Cadastrar item lá não tem efeito.
2. O item aparece no menu para quem monta `/administrativo` — mas o **`RotaGate`** exige o slug guarda-chuva **`tela.financeiro`**, porque as rotas novas não têm entrada própria em `rotasRegistry.ts` nem (provavelmente) na tabela viva de rotas. Usuário sem esse slug: menu mostra o link, clique redireciona para `/sem-permissao` — dando a sensação de "não aparece".

---

## 1) Rota — caminho completo

- `src/App.tsx:641` → `<Route path="integridade-financeira" element={<IntegridadeFinanceira />} />`
- `src/App.tsx:642` → `<Route path="auditoria" element={<AuditoriaFinanceira />} />`
- Pai direto: `src/App.tsx:618` → `<Route path="/administrativo" element={<FinancasLayout />}>`
- Envelope maior: `src/App.tsx:272` → `<Route element={<ProtectedRoute><RotaGate><CasaLayout /></RotaGate></ProtectedRoute>}>` (comentário confirmando em `src/App.tsx:392`)
- **Caminho final montado:** `/administrativo/integridade-financeira` e `/administrativo/auditoria` ✅

## 2) Guarda de rota

- `ProtectedRoute` + `RotaGate` envolvem toda a árvore (`src/App.tsx:272`). `ProtectedRoute` aqui **não** recebe `permModule`/`allowedRoles` — a checagem fina é do `RotaGate`.
- `src/components/RotaGate.tsx:16` — `super_admin` passa direto.
- `src/components/RotaGate.tsx:31-36` — resolve regra por prefixo (config do banco `useRotasConfig` tem prioridade; fallback = `rotasRegistry.ts`).
- `src/components/RotaGate.tsx:48-50` — se `!temPermissaoTela(regra.tela_slug, permitidas)` → `Navigate to="/sem-permissao"`.
- Como as duas rotas não têm entrada específica, casam no prefixo genérico `/administrativo` → **slug exigido: `tela.financeiro`** (`src/config/rotasRegistry.ts:45`).

## 3) Sidebar efetivamente renderizado sob `/administrativo/*`

- Layout ativo: **`FinancasLayout`**.
  - Import: `src/layouts/FinancasLayout.tsx:4`
  - JSX: `src/layouts/FinancasLayout.tsx:27` → `<FinancasContextSidebar />`
- **Não** é `AdminFinanceiroSidebar`.

## 4) Uso efetivo dos sidebars

- **`AdminFinanceiroSidebar`**
  - Definido: `src/components/AdminFinanceiroSidebar.tsx:70`
  - Importado apenas por: `src/layouts/AdminFinanceiroLayout.tsx:4` (JSX em `:35`)
  - `AdminFinanceiroLayout` é importado em `src/App.tsx:15` **mas nenhum `<Route element={<AdminFinanceiroLayout />}>` existe** em `src/App.tsx` (grep sem resultado).
  - **Conclusão: órfão / código morto na árvore de rotas em execução.**
- **`FinancasContextSidebar`**
  - Definido: `src/components/financas/FinancasContextSidebar.tsx:44`
  - Importado/renderizado: `src/layouts/FinancasLayout.tsx:4` e `:27`
  - Este sim é o sidebar que o usuário vê em `/administrativo/*`.

## 5) Filtro de permissão dentro do sidebar

- `FinancasContextSidebar.tsx` **não tem filtro** por papel/permissão/feature flag — os itens são JSX estático:
  - "Integridade Financeira" em `src/components/financas/FinancasContextSidebar.tsx:67`
  - "Auditoria" em `src/components/financas/FinancasContextSidebar.tsx:68`
- Nenhum import de `usePermissoesDoUsuario` / `useRotasConfig` / `hasPermission` no arquivo (checar `:41-42`).
- **Ambos os itens PASSAM pelo sidebar** — deveriam aparecer para todo usuário autenticado que carrega `/administrativo`.
- `AdminFinanceiroSidebar.tsx:60` também lista "Auditoria", mas como o componente é órfão (item 4), é irrelevante.
- **Pendência de leitura:** conteúdo interno de `FinancasSidebarItem.tsx` e `FinancasSidebarSection.tsx` não foi lido linha a linha — no improvável caso de eles fazerem checagem interna de permissão, isso mudaria a conclusão.

## 6) Tabela / registro de permissão de tela

- Hook: `src/hooks/usePermissoesDoUsuario.ts:21-36` — chama RPC `usuario_telas_permitidas` (`:30`) e retorna `Set<string>` de slugs permitidos.
- Helper: `src/hooks/usePermissoesDoUsuario.ts:11-19` (`temPermissaoTela`):
  - `:16` slug exato → permite
  - `:17` slug com prefixo `tela.fin_` E usuário tem `tela.financeiro` → permite
- Config viva por rota: `src/hooks/useRotasConfig.ts:17-27` — RPC `listar_rotas_config` (`:22`), editável em `/admin/visibilidade`; **tem prioridade** sobre `rotasRegistry.ts` (`RotaGate.tsx:31-36`).
- `src/config/rotasRegistry.ts` — leitura integral (linhas 12-72): **não existe entrada específica** para `integridade-financeira` nem `auditoria`. Cai no prefixo `/administrativo` (`:45`) → slug `tela.financeiro`.
- **Para tornar acessível a usuários sem o guarda-chuva `tela.financeiro`**, as rotas precisariam ter entrada própria (ex. `tela.fin_integridade` / `tela.fin_auditoria`) tanto em `rotasRegistry.ts` quanto na tabela viva por trás de `listar_rotas_config` — hoje não têm.
- **Pendência de banco:** sem executar SQL (fora do escopo desta investigação), não dá para confirmar se o usuário afetado realmente carece do slug `tela.financeiro`, ou se a tabela viva já tem alguma entrada sobrescrevendo o registry.

---

## Causa mais provável

O usuário está autenticado e carrega `/administrativo`, mas **não possui o slug `tela.financeiro`** (só slugs finos `tela.fin_*`). Como `FinancasContextSidebar` não filtra nada, o link *aparece* no menu — mas ao clicar o `RotaGate` redireciona para `/sem-permissao` porque as rotas caem no prefixo genérico `/administrativo` que exige `tela.financeiro`. A percepção de "não aparece" pode ser: (a) redirecionamento silencioso, ou (b) o usuário testou em uma sessão que ainda estava renderizando via `AdminFinanceiroSidebar` (não é o caso — é órfão), ou (c) `useRotasConfig` do banco tem entrada `ativo=false` para essas rotas.

Para fechar o diagnóstico com 100% de certeza, faltam duas consultas ao banco: (1) `listar_rotas_config` filtrado por prefixo `/administrativo%`, e (2) `usuario_telas_permitidas(<user_id>)` do usuário afetado.
