# Plano — linhas de de-para por sistema na planilha de cadastro

## Escopo
Alterar somente:
- `supabase/functions/exportar-planilha-produto/index.ts`
- `src/lib/acervo/planilha-cadastro-xlsx.ts`
- `src/lib/acervo/importar-planilha-cadastro.ts`

Sem banco, migrations, outras telas ou publicação.

## Implementação
1. **Levar o de-para na resposta da exportação**
   - Ler em `produto_campo_destino` os registros ativos de Bling, Shopify e XPM, incluindo `campo`, `campo_destino` e `rotulo_tela`.
   - Agrupar todas as linhas por campo e sistema, preservando múltiplos destinos para a montagem com ` + `.
   - Manter intactas as fontes atuais dos produtos, opções, sugestões e pendências.

2. **Montar o novo layout da planilha**
   - Inserir “Sistema” como primeira coluna, estreita e congelada, com slug oculto `_sistema`.
   - Reorganizar as linhas para: slugs na 1, blocos na 2, Bling/Shopify/XPM nas 3–5, cabeçalho atual na 6 e produtos a partir da 7.
   - Nas linhas de sistema, mostrar `rotulo_tela`; usar `campo_destino` em itálico cinza quando o rótulo estiver vazio; usar “não vai” em cinza claro quando não houver destino; juntar múltiplos destinos com ` + `.
   - Deixar vazias nessas linhas as quatro colunas especiais, aplicar fundos discretos por sistema e manter as células editáveis.
   - Deslocar travas, listas, validações, filtro automático, linhas livres e índices de produto para o novo início dos dados; congelar primeira coluna e até a linha 6.

3. **Tornar a importação independente de linhas fixas**
   - Procurar a linha de slugs pela presença dos slugs conhecidos da ficha, exigindo `cod_cadastro`.
   - Identificar o cabeçalho de rótulos depois dela e iniciar pelos primeiros dados com `cod_cadastro` preenchido após esse cabeçalho.
   - Ignorar sempre linhas em que `_sistema` seja Bling, Shopify ou XPM.
   - Preservar a leitura da planilha antiga, o tratamento de células, comparações, sugestões, validações e gravação atuais.

## Verificação
- Rodar o typecheck.
- Gerar a planilha de “Esprit d’Halloween” com dados reais e inspecionar as linhas 3–5 nas colunas `sku`, `ean`, `peso_g`, `material` e `cod_cadastro`, incluindo estilo, fallback e agrupamento.
- Confirmar a estrutura do arquivo: primeira coluna, linha oculta, cabeçalho na linha 6, dados na linha 7, congelamento e células de de-para editáveis.
- Importar em teste uma planilha antiga e a nova, sem alterações nos produtos, e confirmar que ambas resultam em prévia sem nada a gravar.
- Não chamar Bling nem publicar/deployar. Ao final, listar os arquivos alterados.

## Observação técnica confirmada
A coluna `rotulo_tela` já está disponível nos tipos atuais. Nos registros ativos consultados agora, os cinco campos pedidos ainda estão sem `rotulo_tela`, então o teste deverá exibir os nomes técnicos em itálico até essa carga ser feita à parte.
