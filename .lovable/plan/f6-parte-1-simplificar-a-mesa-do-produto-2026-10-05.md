# F6 (parte 1) — Simplificar a Mesa do Produto

Escopo: somente `src/pages/acervo/MesaProduto.tsx` e, se ficar sem uso, `src/components/acervo/PromoverFaseLote.tsx` (apagar). Nada de edges, banco, planilha, Conciliação, Destinos ou Ficha.

## O que sai da Mesa
- Botão "Exportar CSV" (e a função `exportar` + `csvCelula`, que só ele usa).
- Link "Promover N prontos" sob cada card (`promoverProntos`, `prontosDaFase`).
- Checkbox por linha e "selecionar todos", barra "N selecionados · Limpar seleção" e botão "Promover N para a próxima fase" (`PromoverFaseLote`, estados `selecionados`/`abrirLote`, `linhasSelecionadas`, `paraLote`).
- Coluna "Ações" (promover / voltar fase / descontinuar por linha).
- Coluna "Ficha completa": removida do catálogo `COLUNAS` (sai do seletor de colunas também). Preferência salva com essa chave é ignorada em silêncio (o código já faz isso).

## O que fica
- Botões: Exportar planilha de cadastro, Importar planilha de cadastro (guardado), Atualizar.
- Cards Registrado / Pré-Venda / Ativo / Inativo (clicar filtra por fase), Aguardando medição e Formato inválido.
- Tabela com busca, situação, fase, coleção, grupo, sistemas, colunas, ordenação, paginação; clicar na linha continua abrindo a ficha.

## Código morto a limpar (depois de remover acima)
Verificar uso e apagar o que ficar órfão: `chamarPromocao`, `agir`, estados `emAcao`, `confirmSaldo`, `faltando`, `erroFop`, `regressao`/`motivoRegressao` e seus 4 diálogos (saldo, regressão, campos faltantes, erro FOP), permissões `semPermFase`/`tituloPermFase`, imports (`Checkbox` só se o seletor de colunas não usar — ele usa, então fica), ícones e tipos não usados.
Nota: a promoção/regressão em lote continua existindo na Conciliação de Cadastro; só sai da Mesa.
`PromoverFaseLote.tsx`: hoje só a Mesa o importa (confirmado por busca) — será apagado, mas antes revalido a busca.

## Verificação
Typecheck; abrir a Mesa no navegador: sem CSV, sem "Promover", sem checkbox/barra, sem colunas Ações e Ficha completa; clicar num card filtra; abrir os diálogos de exportar e importar; clicar na linha abre a ficha. Nada publicado.

## Entrega
Listo arquivos alterados e removidos. O ponto "clique no card sem registro em `acao_superficie`" segue pendente com você.
