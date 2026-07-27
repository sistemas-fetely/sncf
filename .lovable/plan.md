# Mapa da navegação principal (Top Nav)

Investigação só — nenhum arquivo alterado. Nenhuma proposta de solução.

## 1. Onde os itens do header são declarados

**Componente do header:** `src/components/casa/CasaTopNav.tsx`
Renderiza a lista horizontal (Casa · Pessoas · Finanças · Marca · Crédito · SOPs · Acervo) via `NavLink`, aplicando `text-gold` + sublinhado dourado quando ativo.

**Fonte da lista (a "tabela" de áreas):** `src/components/casa/CasaApps.ts` — exporta `CASA_APPS: CasaApp[]`.

Cada entrada tem esta forma (ex. SOPs):
```ts
{
  id: "recebimento",
  label: "SOPs",
  defaultRoute: "/pedidos",
  routeMatchers: ["/recebimento", "/pedidos", "/comercial", "/vendas",
                  "/administrativo-fetely/parceiros", "/credito/clientes",
                  "/logistica", "/parceiros", "/canal-cpo"],
  icon: HandCoins,
  tela_slug: "tela.pedidos",
}
```

Apps declarados hoje (na ordem do array): `casa`, `pessoas`, `financas`, `marca`, `credito`, `recebimento` (label "SOPs"), `comercial` (label "Comercial", `hiddenFromTopNav: true`), `acervo`, `mesa` (`hiddenFromTopNav: true`, `requireAdminRole: true`).

Ou seja: **"Comercial" e "Mesa" existem no array mas NÃO aparecem no header** (flag `hiddenFromTopNav`).

## 2. Como o header sabe qual área está ativa

Via **hook `useCasaApp`** em `src/hooks/useCasaApp.ts`. É **match por prefixo de rota**, não por prop nem contexto.

Lógica:
1. Achata todos os pares `{ app, matcher }` a partir de `CASA_APPS[].routeMatchers`.
2. Ordena por comprimento do matcher **descendente** — matcher mais específico ganha.
3. Retorna o primeiro app cujo matcher seja igual ao `pathname` ou seja prefixo (`pathname === matcher || pathname.startsWith(matcher + "/")`).
4. Fallback: `CASA_APPS[0]` (Casa).

O "sops" ao lado do logo FETÉLY vem daí: em `/comercial/oportunidades`, os matchers candidatos são `/comercial` (do app `comercial`, mas `hiddenFromTopNav`) e também bate em nada do app `recebimento` diretamente pra `/comercial` — mas `routeMatchers` do `recebimento` **inclui `/comercial`**. Como ambos têm o mesmo comprimento (`/comercial` = 10), o desempate é a ordem estável do `.sort` sobre o array achatado; hoje o resultado observado ("sops" ativo em rotas /comercial/*) é consequência dessa colisão de matchers — `/comercial` aparece tanto em `recebimento.routeMatchers` quanto em `comercial.routeMatchers`.

## 3. Layouts existentes

Diretório: `src/layouts/`
- `AcervoLayout.tsx`
- `AdminFinanceiroLayout.tsx`
- `AdminLayout.tsx`
- `AdministrativoLayout.tsx`
- `CasaLayout.tsx`
- `FinancasLayout.tsx`
- `GestaoVistaLayout.tsx`
- `PublicLayout.tsx`
- `SNCFLayout.tsx`
- `TILayout.tsx`
- `VendasLayout.tsx`

Amarrações em `src/App.tsx` (linhas relevantes):
- `<Route element={<VendasLayout />}>` — envolve `/pedidos`, `/recebimento/cobranca`, `/vendas/*`, `/logistica*`, `/administrativo-fetely/parceiros`, `/comercial/estoque-virtual`, `/comercial/oportunidades`, `/canal-cpo` (linhas 297–321).
- `<Route element={<AcervoLayout />}>` — envolve as listagens de Acervo (`/processos`, `/documentacao`, …) a partir da linha 328.
- `<Route path="/administrativo" element={<FinancasLayout />}>` — linha 591.
- `<Route path="/administrativo-fetely" element={<AdministrativoLayout />}>` — linha 643 (área "Marca").
- `<Route element={<GestaoVistaLayout />}>` — linha 664 (envolve `/dashboard`, `/gestao-a-vista`, `/relatorios`).
- `AdminLayout` / `TILayout` — usados pelas rotas de "Mesa" (`/admin`, `/ti`).
- `CasaLayout` — wrapper externo padrão (fora dos layouts de área).
- `SNCFLayout`, `AdminFinanceiroLayout`, `PublicLayout` — existem no diretório; posições de uso em `App.tsx` não foram inspecionadas nesta rodada.

## 4. Layouts atuais de /comercial

Ambas as rotas estão dentro do **VendasLayout**:

```
src/App.tsx:317  <Route path="/comercial/estoque-virtual" element={<EstoqueVirtual />} />
src/App.tsx:318  <Route path="/comercial/oportunidades"  element={<Oportunidades />} />
```

Ambas debaixo de `<Route element={<VendasLayout />}>` (linhas 297–321). Não há rota `/comercial` raiz nem sub-rotas de `/comercial` fora desse bloco.

## 5. Permissão / visibilidade por área

Sim, no próprio `CasaTopNav.tsx`. Filtra `CASA_APPS` assim:

```ts
const isSuperAdmin = (roles ?? []).includes("super_admin");
const { data: permitidas } = usePermissoesDoUsuario();

const visibleApps = CASA_APPS.filter((a) => {
  if (a.hiddenFromTopNav) return false;
  if (isSuperAdmin) return true;
  if (a.tela_slug && TELAS_PUBLICAS.has(a.tela_slug)) return true;
  if (a.tela_slug && permitidas?.has(a.tela_slug)) return true;
  if (a.slugPrefix && permitidas) {
    for (const s of permitidas) if (s.startsWith(a.slugPrefix)) return true;
  }
  return false;
});
```

**Hook:** `usePermissoesDoUsuario()` em `src/hooks/usePermissoesDoUsuario.ts`.
- Chama a **RPC `usuario_telas_permitidas(p_user_id)`** e devolve um `Set<string>` dos slugs.
- Cache TanStack Query por 5 min.
- Desabilitado se o usuário for `super_admin` (bypass total).

**Helpers exportados no mesmo arquivo:**
- `TELAS_PUBLICAS = new Set(["tela.home", "tela.self"])` — telas liberadas a qualquer usuário aprovado.
- `temPermissaoTela(slug, permitidas)` — inclui o guarda-chuva: quem tem `tela.financeiro` ganha qualquer `tela.fin_*` automaticamente.

**Como cada app é gatilhado no header:**
- `tela_slug` (ex.: `tela.pedidos` para SOPs, `tela.credito`, `tela.pessoas`, `tela.financeiro`, `tela.admin_fetely`, `tela.sncf`, `tela.home`).
- `slugPrefix` (só Finanças usa hoje: `"tela.fin_"`) — permite mostrar Finanças a quem tem qualquer sub-slug granular sem ter o slug-mãe.
- `hiddenFromTopNav` — some do header sempre (Comercial, Mesa).
- `requireAdminRole` — declarado na interface mas **não é conferido** no filtro do `CasaTopNav` (Mesa fica escondida via `hiddenFromTopNav`; o `requireAdminRole` só existe como metadado no tipo).

**Não há consulta direta a `sncf_rotas_config`** dentro do `CasaTopNav`/`useCasaApp`. A checagem é 100% via slug + RPC `usuario_telas_permitidas`.
