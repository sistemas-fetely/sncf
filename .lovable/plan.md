# Promoção de fase em lote na Mesa do Produto

## Resultado
A Mesa do Produto permitirá selecionar qualquer quantidade de produtos filtrados, promover cada um para sua próxima fase e, quando chegarem a Ativo, continuar no mesmo fluxo para ligar os cards no Bling.

## Implementação
1. Adicionar uma coluna fixa de seleção à tabela, com checkbox por linha e checkbox do cabeçalho que seleciona ou limpa **todo o recorte filtrado**, não apenas a página atual. A seleção será limpa quando o recorte de filtros mudar.
2. Exibir uma barra de lote quando houver seleção, com quantidade selecionada, ação de limpar e o novo controle de promoção.
3. Criar `PromoverFaseLote.tsx` seguindo o padrão visual e operacional de `VoltarFaseLote.tsx`:
   - ler `produto_fase_dim` por ordem;
   - calcular a próxima fase individual de cada produto, sem slug fixo;
   - avisar quando a seleção mistura fases/destinos;
   - listar os códigos e aceitar motivo opcional;
   - chamar `promover-fase-produto` sequencialmente, um SKU por vez;
   - continuar após falhas, mostrar progresso `N de M` e detalhar cada erro por código;
   - aplicar `BotaoGuardado` e a permissão `acao.produto_promover_fase`.
4. Extrair apenas o tratamento compartilhado da chamada e dos erros de promoção para um utilitário da Mesa/Acervo, preservando o comportamento de `VoltarFaseLote` sem alterar seu fluxo.
5. Guardar os produtos promovidos com sucesso. Se algum destino for `ativo`, mostrar no resultado “Ativar no Bling os N promovidos” e abrir o `CorrigirBlingLote` existente com esses produtos e `sugerirCard=true`, mantendo comparação, dry-run e Aplicar atuais.
6. Transformar o indicador de Pré-Venda quando houver produtos prontos: o clique abrirá diretamente o lote com todos os `pronto_proxima_fase=true` dentro dos filtros ativos já selecionados. Os demais indicadores continuam filtrando como hoje.
7. Ao terminar promoção ou correção no Bling, invalidar/refazer as consultas da Mesa que alimentam tabela, sugestões, conciliação, pendências e indicadores.

## Comportamento e limites
- Produtos sem próxima fase ficam nomeados como falha e não recebem chamada.
- Seleções com fases diferentes exibem destinos por produto; o texto curto do botão usa “próxima fase” em vez de prometer um único destino.
- A seleção pelo cabeçalho abrange busca, situação, fase, coleção, grupo, sistemas e indicador ativos.
- Nenhuma edge, regra de banco ou tela fora da Mesa do Produto será alterada.

## Correção incorporada: observações da Venda Direta
Antes da implementação da Mesa, ajustar somente o ramo da venda direta em `enviar-pedido-bling-b2c`: manter `numeroLoja`, retirar `observacoes` e enviar o mesmo texto em `observacoesInternas`. O ramo Shopify permanece intocado. Validar essa função com `deno check`.

## Validação
- Rodar typecheck e confirmar build sem erros.
- Conferir no navegador seleção individual, seleção de todos os filtrados e limpeza ao trocar filtros.
- Abrir o lote pelo indicador de Pré-Venda e pela barra da tabela.
- Validar mistura de fases, lista de códigos, motivo opcional e progresso sem executar uma promoção real em massa.
- Confirmar que o encadeamento abre o fluxo existente do Bling somente com sucessos promovidos para Ativo.

## Arquivos previstos
- Criar `src/components/acervo/PromoverFaseLote.tsx`.
- Criar um utilitário compartilhado de chamada/erro de promoção em `src/components/acervo/`.
- Alterar `src/pages/acervo/MesaProduto.tsx`.
- Alterar `src/components/acervo/VoltarFaseLote.tsx` somente para consumir o utilitário extraído, sem mudar sua interface ou comportamento.
- Alterar `src/components/acervo/CorrigirBlingLote.tsx` apenas se for necessário expor uma abertura controlada para o encadeamento.
