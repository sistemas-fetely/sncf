# F3 passo B — Sugestões "a confirmar" vindas de `produto_sugestao_espelho`

## 1. Edge `exportar-planilha-produto`
- Ler `produto_sugestao_espelho` (`resolvida = false`) filtrando pelos `cod_cadastro` exportados (lotes de 300).
- Sugestão só entra quando o FOP está vazio naquele campo.
- Remover a sugestão calculada pela diferença com `sncf_produtos`. O espelho continua sendo lido só para `nome_operacional`; `inner_qtd` continua vindo de `cartorio_codigo`.
- Falha de leitura = erro na resposta (fail-loud).

## 2. Edge `gravar-produto-fop` (modo planilha)
- Depois de gravar a trilha com sucesso, buscar as sugestões abertas desse `cod_cadastro` nos campos gravados.
- Para cada uma: `resolvida = true`, `resolvida_em = now()`, `resolvida_por = usuário`, `resolucao = 'confirmada'` se o valor gravado for igual à sugestão (mesma comparação normalizada: texto aparado / número / Sim-Não), senão `'corrigida'`.
- A escrita é feita pelo servidor (service role); o navegador não escreve na tabela.
- Falha nessa atualização: a resposta volta com `ok: false` e a mensagem "FOP e trilha gravados, mas a resolução da sugestão falhou: …". O diálogo já mostra isso em "recusas" com o motivo real.

## 3. Prévia da importação
- `calcularPrevia` marca `confirmando_sugestao: true` na mudança quando o FOP está vazio e há sugestão aberta para o campo.
- O diálogo mostra "(confirmando sugestão)" ao lado do campo.
- A regra atual continua igual: sugestão amarela deixada como veio não é gravada.

## Fora do escopo
Nenhuma tabela ou migração nova. Nada fora da Mesa e dessas duas funções. Nada publicado. As duas funções vão para o ar só para o teste, como nas fases anteriores.

## Teste
Exportar "Esprit d'Halloween" e conferir:
- 02034 a 02041 continuam com embalagem e material em amarelo.
- A profundidade não aparece como sugestão.

Opcional: importar uma confirmação e checar se a sugestão foi marcada como resolvida.

## Arquivos
- `supabase/functions/exportar-planilha-produto/index.ts`
- `supabase/functions/gravar-produto-fop/index.ts`
- `src/lib/acervo/importar-planilha-cadastro.ts`
- `src/components/acervo/ImportarPlanilhaCadastroDialog.tsx`
