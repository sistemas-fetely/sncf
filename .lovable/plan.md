# F4 — Portão de formato na Mesa e na importação

Banco já pronto (view `vw_produto_formato_alerta`, RPC `fn_produto_formato_validar_patch`). Nada novo no banco.

## 1. Mesa do Produto — card "Formato inválido"
- Card novo ao lado de "Aguardando medição": contagem de produtos distintos (`cod_cadastro`) na view com `fase <> 'inativo'`. Erro real aparece no card (fail-loud), como o card de medição.
- Clique abre o diálogo novo `FormatoInvalidoDialog`: tabela produto (cod · sku · coleção · fase), campo, valor, motivo; caixa "incluir inativos" (desmarcada); contador de produtos.
- Botão "Exportar planilha destes produtos" abre `ExportarPlanilhaCadastroDialog` com a lista de cods dos produtos visíveis.

## 2. Exportação
- A edge `exportar-planilha-produto` já aceita `cods` (desde a F2a) — reaproveitada, sem mudança.
- `ExportarPlanilhaCadastroDialog` ganha prop opcional `cods?: string[]`: quando presente, esconde o seletor de coleções, mostra "N produtos com formato inválido" e manda `cods` no corpo; nome do arquivo `cadastro_produto_formato_invalido_<data>.xlsx`.

## 3. Prévia da importação
- Depois do cálculo de diferenças, para cada SKU com mudanças chama `fn_produto_formato_validar_patch(cod, patch)` em lotes paralelos de 8.
- Violação vira erro nomeado ("NCM: esperado 8 dígitos — 4823.69") e a linha inteira é pulada, igual a "valor fora da lista". Falha da chamada também pula a linha com o erro real.
- O patch inclui as sugestões mantidas, se a caixa "Confirmar estas sugestões" estiver marcada (revalida ao marcar).

## 4. Defesa no servidor
- `gravar-produto-fop`, só no modo planilha: antes de enviar ao FOP chama a mesma RPC com o patch; se houver violação responde 422 `{ ok:false, erro, violacoes:[{campo,valor,regra,motivo}] }`. Os outros chamadores não mudam.

## Teste
- (a) Card mostra 0; no diálogo, com "incluir inativos", 2 produtos (01513, 01581).
- (b) Importar planilha com NCM "4823.69" num SKU: prévia mostra o erro e pula a linha; nada é gravado.
- Typecheck + `deno check`; deploy só da `gravar-produto-fop` para o teste; app não publicado.

## Arquivos
- `src/pages/acervo/MesaProduto.tsx` (card + diálogo)
- `src/components/acervo/FormatoInvalidoDialog.tsx` (novo)
- `src/components/acervo/ExportarPlanilhaCadastroDialog.tsx`
- `src/lib/acervo/importar-planilha-cadastro.ts`
- `src/components/acervo/ImportarPlanilhaCadastroDialog.tsx`
- `supabase/functions/gravar-produto-fop/index.ts`

Observação: o clique no card é ação nova de abrir diálogo, sem registro em `acao_superficie` (fica com o Flavio).
