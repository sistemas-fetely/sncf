# BLING-REENVIO-VERIFICADO

## Implementação
- `enviar-pedido-bling`, ação `reenviar`: conferência obrigatória na API, sem confirmação para ignorar cancelamento. Mantém o caminho fiscal de sistema separado.
- `fn_bling_reenvio_verificado_preparar`: somente serviço; trava a linha, valida vínculo antigo e NF viva novamente, recusa tentativas irmãs vivas, registra `bling_reenvio`, cancela tentativas do id antigo e limpa os quatro campos de envio. Não remove o histórico.
- Não há fila auxiliar consultada pelo envio normal além de `pedido_remessa`; logs antigos permanecem.
- Situação Cancelado descoberta pela API de módulos/situações; o catálogo local também foi conferido (Vendas / Cancelado), mas não se fixa seu id no código.
- `has_role_with_level` não existe no banco atual. Reenvio usa a autorização vigente `acao.enviar_bling` e `nivel_do_usuario >= 2`, também aplicada no diálogo e RPC; não cria concessões.

## SQL aplicado
Migration integral: `drizzle/migrations/0098_bling_reenvio_verificado.sql`.
Amplia `pedido_eventos_tipo_evento_check` preservando todos os valores existentes e `NOT VALID`; cria a RPC e restringe execução ao serviço.

Atualização pontual do censo existente:
```sql
UPDATE public.acao_superficie SET rotulo='Reenviar ao Bling', dispara='enviar-pedido-bling acao=reenviar', guarda_atual='acao.enviar_bling + nivel_do_usuario >= 2', permissao_id='a030fa7e-c7f5-428d-b1ff-0dae50d44f05', observacao='Reenvio humano verificado no Bling: somente Cancelado/404, sem NF viva e motivo mínimo 10. Sem override; conferência server-side.', updated_at=now() WHERE arquivo='ReenviarBlingDialog.tsx' AND rota='/pedidos/:id';
```

## Verificações
- 14 testes Deno de conferência/orquestração e 4 Vitest do hook/invalidação aprovados; Deno check, gate e compilação automática aprovados.
- PED-2417 aberto com dados reais em sessão autenticada; diálogo, motivo curto e recusa simulada conferidos no computador/celular.
- Função implantada: somente `enviar-pedido-bling`.
- Chamada autenticada hospedada, motivo com nove caracteres: HTTP 409 `{"sucesso":false,"erro":"Motivo obrigatório (mínimo 10 caracteres)."}`.
- PED-2417 manteve `bling_id_destino=27443803842`, carimbo e erro inalterados. Não executado reenvio real; sucesso/erro posterior exercitados com dependências simuladas.
- Tipos regenerados automaticamente pela migration também capturaram diferenças de catálogo preexistentes; nenhuma edição manual.
- Sem publicação do aplicativo. Lint amplo de AcoesRemessa conserva sete erros de `any` preexistentes; o gate obrigatório passa.