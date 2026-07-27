
# Mapa — Estoque Virtual e vizinhos

## 1. Onde "Estoque Virtual" está declarado hoje (sidebar SOPs)

Arquivo: `src/components/vendas/VendasSidebar.tsx` (é a sidebar do app **SOPs / Vendas**, não é do Comercial).

Trecho, linha 82 (dentro do grupo principal, entre "Parceiros" e "Produtos"):

```tsx
// linhas 76-85
<FinancasSidebarItem to="/vendas/gestao-pedidos" icon={TableProperties} label="Gestão de Pedidos" />
<FinancasSidebarItem to="/vendas/triagem-estoque" icon={PackageOpen} label="Triagem de Estoque" />
<FinancasSidebarItem to="/pedidos" icon={ShoppingCart} label="Pedidos B2B" end />
<FinancasSidebarItem to="/vendas/shopify" icon={ShoppingBag} label="Pedidos B2C" end />
<FinancasSidebarItem to="/recebimento/cobranca" icon={Receipt} label="Cobrança" />
<FinancasSidebarItem to="/administrativo-fetely/parceiros" icon={Building2} label="Parceiros" />
<FinancasSidebarItem to="/comercial/estoque-virtual" icon={Boxes} label="Estoque Virtual" />

<FinancasSidebarItem to="/vendas/produtos" icon={Package} label="Produtos" />
<FinancasSidebarItem to="/vendas/farol-pedidos" icon={Radar} label="Farol de Pedidos" />
```

Observação: a rota já é `/comercial/...`, mas o item mora na sidebar de SOPs.

## 2. Sidebar da área COMERCIAL

Arquivo: `src/components/comercial/ComercialSidebar.tsx` (35 linhas, muito enxuta). Único item:

```tsx
<FinancasSidebarItem to="/comercial/oportunidades" icon={Sparkles} label="Oportunidades" />
```

Não há outros grupos/itens. É onde o "Estoque Virtual" deveria aparecer.

## 3. Layouts das rotas em `src/App.tsx`

- `<Route element={<VendasLayout />}>` — linhas 295-318. Contém, entre outras:
  - `/vendas/triagem-estoque` → `TriagemEstoque`
  - `/vendas/produtos` → `Produtos`
  - `/vendas/shopify/produtos` → `ShopifyProdutos`
  - `/vendas/shopify/estoque` → `ShopifyEstoque`
  - **`/comercial/estoque-virtual` → `EstoqueVirtual`** (linha 315 — sim, rota `/comercial/*` declarada dentro do `VendasLayout`, por isso ela renderiza com a sidebar de SOPs)

- `<Route element={<ComercialLayout />}>` — linhas 320-322. Contém só:
  - `/comercial/oportunidades` → `Oportunidades`

Ou seja: hoje a rota `/comercial/estoque-virtual` está fisicamente aninhada no bloco errado de `App.tsx` — dentro de `VendasLayout` em vez de `ComercialLayout`. É isso que faz ela herdar a `VendasSidebar`.

## 4. Todas as telas de "Estoque" / "Produtos" que aparecem na sidebar

| Label na sidebar | Arquivo da tela | Rota | Onde a rota vive em App.tsx |
|---|---|---|---|
| Triagem de Estoque | `src/pages/vendas/TriagemEstoque.tsx` | `/vendas/triagem-estoque` | `VendasLayout` (L304) |
| Estoque Virtual | `src/pages/Comercial/EstoqueVirtual.tsx` | `/comercial/estoque-virtual` | `VendasLayout` (L315) — deslocado |
| Produtos (grupo principal) | `src/pages/administrativo/Produtos.tsx` | `/vendas/produtos` | `VendasLayout` (L300) |
| Produtos (grupo Shopify) | `src/pages/vendas/shopify/ShopifyProdutos.tsx` | `/vendas/shopify/produtos` | `VendasLayout` (L307) |
| Estoque (grupo Shopify) | `src/pages/vendas/shopify/ShopifyEstoque.tsx` (implícito pelo import) | `/vendas/shopify/estoque` | `VendasLayout` (L311) |

Referência auxiliar: `src/components/navegacao/CommandPalette.tsx:41` também cataloga a rota `/comercial/estoque-virtual` com `pilar: "sops"` — outro lugar que reflete o pertencimento atual (errado) à área SOPs.

## Resumo do diagnóstico

Para mover "Estoque Virtual" para o menu COMERCIAL, três pontos precisam mudar de forma coerente:
1. Remover o item da lista em `src/components/vendas/VendasSidebar.tsx` (linha 82).
2. Adicionar o item em `src/components/comercial/ComercialSidebar.tsx`.
3. Mover a linha `Route path="/comercial/estoque-virtual"` em `src/App.tsx` do bloco `VendasLayout` (L315) para dentro do bloco `ComercialLayout` (L320-322).
4. (Opcional) Ajustar o `pilar` no `CommandPalette.tsx:41` de `"sops"` para `"comercial"` para bater com a nova casa.

Sem propor implementação — só o mapa, conforme pedido.
