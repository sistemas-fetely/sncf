## Resultado da investigação (read-only)

Nenhuma alteração é necessária. Tudo o que você usou em `src/pages/Comercial/Oportunidades.tsx` está correto.

### 1. Rota de detalhe de pedido
`src/App.tsx:291`:
```tsx
<Route path="/pedidos/:id" element={<PedidoDetalhe />} />
```
O `<Link to={`/pedidos/${r.pedido_id}`}>` que você escreveu está correto. Componente renderizado: `PedidoDetalhe`.

Rotas relacionadas encontradas (não são detalhe genérico de pedido, apenas para referência):
- `/recebimento/cobranca/:pedidoId` → `CobrancaDetalhe`
- `/recebimento/aguardando-pagamento/:pedidoId` → `AguardandoPagamentoDetalhe`

### 2. Typecheck completo
`bunx tsgo --noEmit`: **zero erros**.

### 3. Helpers e CasaPageHeader
- `formatBRL` — existe em `src/lib/format-currency.ts:1` com esse nome exato.
- `formatDateBR` — existe em `src/lib/format-currency.ts:9` com esse nome exato.
- `CasaPageHeader` (`src/components/casa/CasaPageHeader.tsx`) tem a interface:
  ```ts
  interface Props {
    breadcrumb: CasaBreadcrumbItem[];
    title: string;
    subtitle?: string;
    ...
  }
  ```
  As três props que você usou (`breadcrumb`, `title`, `subtitle`) estão corretas.

### Próximo passo
Nada a implementar — esta foi uma investigação de verificação. Se quiser que eu ajuste algo em `Oportunidades.tsx` ou em outro arquivo, me diga.
