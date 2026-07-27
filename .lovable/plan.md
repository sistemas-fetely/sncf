Investigação apenas, sem alterações.

## Consumo de `vw_produtos_estoque_virtual` (antiga)
- `src/pages/Comercial/EstoqueVirtual.tsx:104` → `queryKey: ["vw_produtos_estoque_virtual"],`
- `src/pages/Comercial/EstoqueVirtual.tsx:107` → `.from("vw_produtos_estoque_virtual")`
- `src/integrations/supabase/types.ts:24988` → definição de tipo auto-gerada (não é consumo)

## Consumo de `vw_estoque` (nova)
Nenhum consumo em páginas/hooks/componentes. Só aparece em `src/integrations/supabase/types.ts` como tipos auto-gerados:
- linha 23267: `vw_estoque`
- linha 23284: `vw_estoque_contabil`
- linha 23291: `vw_estoque_por_local`
- linha 23301: `vw_estoque_real`
- linha 23309: `vw_estoque_shopify_sync`

## Conclusão
Só `src/pages/Comercial/EstoqueVirtual.tsx` usa a view antiga. Nenhuma tela/hook consome `vw_estoque` ainda.

Sem plano de mudança — aguardando instruções.