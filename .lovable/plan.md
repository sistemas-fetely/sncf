# Parceiros Comerciais: lista cortada em 1.000 linhas

## Diagnóstico (confirmado)
Nenhum filtro exclui `tipo='pf'`. A lista carrega `parceiros_comerciais` em uma única chamada, sem paginação (`src/pages/administrativo/Parceiros.tsx:230-240`). O banco devolve no máximo 1.000 linhas por chamada. A busca roda só sobre essas linhas.

- Total: 2.055 parceiros. Só os primeiros 1.000 em ordem alfabética chegam à tela (o último é "HELOISA MARIA PAIXAO DE AZEVEDO MOTA").
- "Lisa Khafif" é a 1.099ª, por isso fica de fora. ELISANDRA vem antes de H e aparece.
- 950 parceiros ativos com 'cliente' ficam invisíveis, de qualquer tipo. Os contadores do topo também ficam errados.

## Correção proposta (só na tela)
- Carregar a lista em lotes de 1.000 até acabar, mantendo a ordem por razão social.
- Nada muda no banco, nos filtros nem na busca.
- Depois, conferir na prévia que buscar "Lisa" mostra Lisa Khafif e que o total dá 2.055.
