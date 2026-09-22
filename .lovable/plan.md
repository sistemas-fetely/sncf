# Correções na Ficha do Produto

## Implementação
- Ajustar a grade de campos para que valores acima de 120 caracteres ocupem uma linha inteira e usem textarea com altura limitada e rolagem interna, tanto em edição quanto em leitura.
- Reequilibrar a hierarquia visual: valores em `foreground`; rótulos e selos em `muted-foreground`; sem reduzir a opacidade do conteúdo somente-leitura.
- Consultar `vw_produto_imagem_final` pelo SKU e incluir a foto no topo da coluna direita, com origem, estado “sem foto”, ampliação em diálogo e link para “Gerenciar fotos”.
- Regenerar os tipos do banco para reconhecer `canal_venda`, sem alterar banco, regras de edição, recusas ou promoção.

## Validação
- Rodar o typecheck exigido pelo projeto e verificar a Ficha em tela larga e estreita, incluindo texto longo, foto e ampliação.

## Escopo
- Alteração visual e de leitura concentrada em `src/pages/acervo/FichaProduto.tsx`.
- `src/integrations/supabase/types.ts` será apenas regenerado a partir do banco existente.
