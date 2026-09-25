# Alinhamento visual do Cockpit do Estoque

## Implementação
- Substituir a paginação própria pelo `RodapePaginacao`, com 20 itens iniciais, opções 20/50/100/200 e preferência da tela `cockpit_estoque`.
- Trocar os cabeçalhos próprios por `CabecalhoOrdenavel` e pela linha de cabeçalho colado usada na Conciliação de Cadastro.
- Ajustar larguras e alinhamentos das dez colunas, mantendo Produto flexível, truncado e sem quebra nos títulos.
- Abrir com ordenação por Disponível decrescente, preservando a ordenação interativa das demais colunas.
- Aplicar aos quatro indicadores a mesma composição visual dos cartões da tela de referência, sem mudar seus recortes.
- Mostrar o estado vazio com “Nenhum produto neste recorte” e ação “Limpar filtros”.

## Validação
- Rodar o typecheck exigido pelo projeto.
- Conferir com sessão em 1440px: sem rolagem horizontal, rodapé visível e primeira página ordenada pelos maiores disponíveis.

## Escopo
- Alterar somente `src/pages/Comercial/EstoqueVirtual.tsx`.
- Não alterar consultas, dados, regras de filtro ou banco.
