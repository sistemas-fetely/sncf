# Diagnóstico (somente leitura)

## 1. Onde vive a guarda

Backend, na edge function **`supabase/functions/enviar-pedido-bling/index.ts`**, linhas **304–311** (bloco "4. Títulos").

Não existe guarda espelhada no frontend — o botão "Enviar pro Bling" (`src/components/pedidos/dialogs/EnviarBlingDialog.tsx` e `src/components/pedidos/RemessasSection.tsx`) só valida `bling_id` do parceiro e status da remessa; o bloqueio por ausência de títulos vem 100% do backend, via mensagem devolvida pelo hook `useEnviarBling.ts`.

## 2. Trecho exato da guarda

```ts
// 4. Títulos (sempre do pedido — cobrança não fragmenta por remessa em v1)
const { data: titulos } = await supabase
  .from("titulo_a_receber")
  .select("id, numero_parcela, valor_bruto, data_vencimento_original, tipo_pagamento, eh_entrada")
  .eq("pedido_id", pedido_id)
  .order("numero_parcela");
if (!titulos || titulos.length === 0) {
  return err("Pedido sem títulos — confirme o portão na aba Primeiro Pagamento, ou materialize a cobrança, antes de enviar ao Bling.", 409);
}
```

## 3. Como o payload de "parcelas" pro Bling é montado hoje

Fonte única: a tabela **`titulo_a_receber`** filtrada por `pedido_id` (mesmo select acima). **Não** parte de `formas_pagamento` nem de configuração de cobrança — se não há título materializado, não há parcela.

Depois (linhas 408–431), cada título vira uma parcela Bling, com rateio proporcional ao valor da remessa (fator = `valorRemessa / somaTitulos`, para o caso de remessa dividida):

```ts
const blingParcelas = titulos.map((t: any) => ({
  dataVencimento: t.data_vencimento_original,
  valor: parseFloat((Number(t.valor_bruto) * fatorRemessa).toFixed(2)),
  formaPagamento: { id: Number(blingFormaId) },
}));
```

O `blingFormaId` vem de `formas_pagamento.bling_id_forma_pagamento` (com auto-correção via GET `/formas-pagamentos` do Bling) — mas isso só define a **forma** exibida em cada parcela; a **existência** e o **valor**/vencimento de cada parcela dependem exclusivamente dos títulos.

Ajuste de centavo (linhas 424–431) força a soma das parcelas a bater exatamente com o valor da remessa.

## 4. Uso de `pedidos.natureza_operacao_id` / tabela `naturezas_operacao`

**Nenhum uso funcional no código-fonte.** Uma busca por `natureza_operacao` / `naturezas_operacao` retorna apenas:

- `src/integrations/supabase/types.ts` — tipos gerados automaticamente (colunas `natureza_operacao_id` em `pedidos`, tabela `naturezas_operacao`, FK). Auto-gerado, não é uso.
- Ocorrências de `nf_natureza_operacao` em parsers de NF (`xml-nfe-parser.ts`, `xml-nfse-parser.ts`, `xml-cte-parser.ts`, `csv-qive-parser.ts`, `import-handler.ts`, `useRegrasCategorizacao.ts`, `ImportadorNFs.tsx`) — **campo diferente**, texto da natureza de operação da NF entrada, não tem relação com `pedidos.natureza_operacao_id`.

Ou seja: a edge function `enviar-pedido-bling` **nunca lê** `pedidos.natureza_operacao_id` nem consulta a tabela `naturezas_operacao`. O payload enviado ao Bling hoje não carrega naturezaOperacao vinda desse cadastro — se o Bling recebe uma, é o default configurado lá dentro.

## Próximo passo

Sem plano de mudança nesta etapa — este é só o diagnóstico solicitado. Quando quiser evoluir (ex.: relaxar a guarda para pedidos sem título ainda materializado, ou passar `naturezaOperacao` a partir de `pedidos.natureza_operacao_id`), aí montamos o plano de edição.
