# Telas travando por tempo limite do banco

Dois avisos ainda abertos apontam para o mesmo problema de fundo: consultas grandes demais
para o tempo que o banco permite. Não são erros de uma tela só, então não mexi no código
sem sua aprovação.

## O que está acontecendo

1. Várias telas de lista pedem de uma vez 2.000 a 5.000 linhas (estoque, produtos,
   conciliação de despesas, destinos, funil, auditoria). Em horário de movimento essas
   consultas passam do tempo limite e a tela fica carregando ou aparece vazia.
2. O serviço que atende todas as chamadas ao banco também falhou ao recarregar o mapa das
   tabelas (16 vezes em dois dias). Quando isso acontece, qualquer tela pode dar erro ao
   mesmo tempo. A causa é a quantidade de tabelas e views no banco somada à carga dessas
   consultas pesadas.

## O que eu faria

Passo 1 — telas pesadas (uma por vez, começando pelas mais usadas)
- Trocar o bloco único de milhares de linhas por páginas de 100 a 200, com botão de
  carregar mais.
- Filtrar por período no banco (últimos 90 dias por padrão), em vez de trazer tudo e
  filtrar na tela.
- Criar índices para as consultas que continuarem lentas, medindo antes e depois.

Passo 2 — aliviar o banco
- Levantar tabelas e views que ninguém mais usa e aposentá-las, com sua confirmação item
  por item.
- Ajustar o tempo limite do serviço de dados para o recarregamento do mapa não morrer no
  meio.

## Como saber que funcionou

Abrir Estoque, Produtos e Conciliação de despesas em horário de movimento e ver a lista
aparecer em poucos segundos, sem tela vazia. E nenhum novo aviso de tempo limite nos
registros durante uma semana.

## Detalhes técnicos

- Telas com limite alto: `EstoqueVirtual.tsx` (5000), `SaudeEstoque.tsx` (5000),
  `Produtos.tsx` (5000), `EntradasEstoque.tsx` (5000), `FunilFases.tsx` (5000),
  `useDevolucoesRetornoPendente.ts` (5000), `ConciliacaoDespesas.tsx` (2000),
  `EstoqueXpm.tsx` (2000), `useAuditoria.ts` (2000), `DestinosCadastro.tsx` `.range(0,9999)`.
- Erro observado: SQLSTATE 57014 (`canceling statement due to statement timeout`) via
  PostgREST, e falha de reload do schema cache com o mesmo código.
- Paginação por `.range()` com `count: "exact"` nos hooks, mantendo as query keys atuais
  com o número da página.
- Índices sobre as colunas de filtro/ordenação das views compostas envolvidas.
