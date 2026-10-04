# Aguardando medição — planilha, card na Mesa e freio no Shopify

Nada no banco. Nada publicado. Nenhuma outra tela.

## 1. Edge `exportar-planilha-produto`
- Cada produto passa a trazer `pendencias_medicao` (de `_pendencias_medicao` do FOP; `[]` se não vier).
- Novo filtro opcional `so_aguardando_medicao: true`: mantém só produtos com `pendencias_medicao` não vazio (aplicado depois do filtro de coleções).
- Nova opção `so_contagem: true`: devolve só `{ ok, aguardando_medicao: N }`, sem montar ficha/opções — usado pelo card, para não baixar o catálogo inteiro.
- Entradas validadas (booleanos); erro real na resposta.

## 2. Planilha (`planilha-cadastro-xlsx.ts`)
- Tipo do produto ganha `pendencias_medicao: string[]`.
- Coluna "Falta medir" logo depois de "Falta para <próxima fase>", slug oculto `_pendencias_medicao`, rótulos via o mesmo mapa da ficha; "—" quando vazio. Mesmo estilo/trava das colunas finais.

## 3. Mesa do Produto + diálogo
- `ExportarPlanilhaCadastroDialog`: checkbox "Só aguardando medição (lista para o showroom)", repassado à edge; aceita prop `inicialSoMedicao` aplicada ao abrir.
- `MesaProduto.tsx`: card "Aguardando medição" na mesma grade de indicadores, contagem por consulta à edge (`so_contagem`). Carregando = skeleton; erro = card mostra "erro" com a mensagem no título (fail-loud, nunca 0 falso). Clicar abre o diálogo com a opção já marcada. O card não altera o filtro da tabela.

## 4. Freio na edge `shopify-cadastrar-produto`
- Antes do laço: lê de `produto_ficha_nascimento` os campos com `exigido_para = 'medicao'` (campo + rótulo). Falha nessa leitura derruba o envio com a mensagem real (sem lista não há como frear).
- Valores do produto lidos da fila/cadastro já carregados; para campos que não estejam nessas seleções, busca extra na tabela de cadastro com as colunas da lista (dinâmica, nada fixo).
- Por SKU: campo vazio = null, "" ou número <= 0 → `status: "bloqueado"`, `erro: "aguardando medição: peso, altura, …"`. Demais SKUs seguem normalmente. Vale também no `dry_run`.

## Teste
- Card mostra ~216.
- Exportar "Esprit d'Halloween" com "só aguardando medição": 02032–02041 com "Falta medir" preenchido, 02025–02031 ausentes.
- Shopify: só `dry_run` com um SKU pendente para ver o bloqueio nomeado (sem criar produto). Typecheck + `deno check` nas duas edges. As edges precisam ser implantadas para o teste (como na F1).

## Arquivos
- `supabase/functions/exportar-planilha-produto/index.ts`
- `src/lib/acervo/planilha-cadastro-xlsx.ts`
- `src/components/acervo/ExportarPlanilhaCadastroDialog.tsx`
- `src/pages/acervo/MesaProduto.tsx`
- `supabase/functions/shopify-cadastrar-produto/index.ts`

## Ponto de atenção
- Clique no card é ação nova de abrir diálogo (mesma ação do botão de exportar já existente); não registro em `acao_superficie` — fica com você, como na F1.
