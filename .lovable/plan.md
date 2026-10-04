# F2a: importar a planilha de cadastro (atualização + "Liberar para venda")

Produtos que já existem são atualizados e os marcados são promovidos. Linhas sem `cod_cadastro` são ignoradas e aparecem como "produto novo — ainda não suportado" (isso fica para a F2b). O banco não é alterado e nada é publicado.

## 1. Exportação: coluna "Liberar para venda"
- Fica em `planilha-cadastro-xlsx.ts`, depois de "Falta medir". O slug oculto é `_liberar` e a lista tem "Sim" ou vazio.
- Só pode ser editada quando o produto tem próxima fase. Nos demais, a célula fica travada e cinza.
- A edge de exportação já repassa `proxima_fase`, então ela não muda para isso.

## 2. Edge `exportar-planilha-produto`: filtro por código
- Novo filtro opcional `cods: string[]`. O FOP continua sendo lido pela `fn_produtos_para_sncf`, e a edge filtra o resultado por `cod_cadastro`. Assim a importação pega os valores atuais do FOP na hora.
- Também passa a devolver `cod_cadastro` em cada produto.
- Sem o filtro, tudo funciona como hoje.

## 3. Mesa do Produto: "Importar planilha de cadastro"
- O botão é um `BotaoGuardado` com `acao.produto_importar_planilha_cadastro`, checado por `usePermissaoAcaoOuSuperAdmin`.
- Diálogo novo `ImportarPlanilhaCadastroDialog`:
  1. **Leitura (exceljs):** os slugs vêm da linha 1 e os dados começam na linha 4. Cada linha é identificada pelo `cod_cadastro`. Linhas sem código são listadas à parte.
  2. **Valores atuais:** a edge de exportação é chamada com `cods`, e de lá vêm os valores do FOP, a ficha e as opções.
  3. **Diferença:** só entram os campos com `importavel_planilha = true`. Identidade (cod_cadastro, sku, ean, dun) e `fase` nunca entram.
     - Célula vazia não mexe no campo.
     - Antes de comparar, o texto passa por trim e o número aceita vírgula decimal.
     - Valor fora de `opcoes[campo]` vira erro nomeado e a linha inteira é pulada.
     - Código que não existe no FOP também é erro.
  4. **Prévia:** mostra, por SKU, o de → para de cada campo, se o produto será liberado (e para qual fase) e os erros. Nada é gravado antes de "Confirmar".
  5. **Confirmar:** gera um `lote_id` (crypto.randomUUID). Para cada SKU:
     - (a) se houver mudança, chama `gravar-produto-fop` com `{ cod_cadastro, campos, motivo, origem: "planilha", lote_id }`;
     - (b) se o produto estiver marcado para liberar e (a) tiver dado certo ou não houver mudança, chama `promover-fase-produto` com o mesmo payload do `PromoverFaseLote` (`sku`, `fase_destino` = próxima fase, motivo).
     - Uma barra mostra o progresso.
     - A falha de um SKU não para o lote. Os erros são lidos com `chamarFuncao` e `motivoDaFalha`.
  6. **Resultado:** lista o que foi gravado, o que foi promovido e as recusas com o motivo real. No fim, as queries da Mesa são invalidadas.
- O campo de motivo é obrigatório no diálogo e já vem preenchido com "Importação de planilha de cadastro". A edge exige motivo.

## 4. Edge `gravar-produto-fop`: modo planilha
- **Com `origem === "planilha"`:**
  - Chama `exigirAcao(..., "acao.produto_importar_planilha_cadastro")` de `_shared/permissao-acao.ts`. super_admin passa.
  - A lista do que pode ser gravado são os campos da ficha com `importavel_planilha = true`, de qualquer dono.
  - Identidade e `fase` continuam sempre recusadas.
  - `lote_id` precisa ser um uuid.
- **Sem `origem`, ou com outra origem:** o caminho de hoje fica igual, só para campos com dono `fetely`.
- **Depois que o FOP aceitar, só no modo planilha:**
  - Grava em `produto_campo_alteracao` uma linha por campo, com cod_cadastro, campo, valor_de, valor_para, origem, motivo, usuario_id e lote_id.
  - `valor_de` vem do `de_para` que o FOP devolve.
  - Se a inserção falhar, a resposta volta com erro e com a lista do que já foi gravado no FOP.

## Suposição a confirmar
- **De onde vem o `valor_de`:** não confirmei se a resposta do FOP traz um `de_para`. Hoje a edge monta o `de_para` a partir do espelho do SNCF. Se o FOP não devolver um `de_para`, a edge vai usar o valor atual lido do FOP (pela `fn_produtos_para_sncf`) logo antes de gravar, nunca o espelho. Se você preferir que a edge recuse quando o `de_para` não vier, me avise.

## Teste
- Exportar "Esprit d'Halloween".
- No 02025, mudar o material e marcar "Liberar". Importar a planilha.
- A prévia deve mostrar só esse campo e a liberação para Ativo.
- Ao confirmar, conferir no FOP a gravação, a linha da trilha com o `lote_id` e o 02025 em Ativo.

## Arquivos
- **Alterados:**
  - `src/lib/acervo/planilha-cadastro-xlsx.ts`
  - `supabase/functions/exportar-planilha-produto/index.ts`
  - `supabase/functions/gravar-produto-fop/index.ts`
  - `src/pages/acervo/MesaProduto.tsx`
- **Novos:**
  - `src/components/acervo/ImportarPlanilhaCadastroDialog.tsx`
  - `src/lib/acervo/importar-planilha-cadastro.ts` (leitura, normalização e diferença)
- **Não mexer:** `PlanilhaPendencias.tsx`, telas fora da Mesa e o banco.
