# Dois achados confirmados que pedem decisão antes de mexer

Quatro achados foram corrigidos agora e dois eram problema de credencial (Zenlog e Braspress), não de código.
Sobraram dois que são reais, mas mexem em regra de negócio — por isso viram plano, não edição direta.

## 1. Sincronização do Bling estoura o tempo e perde cliente

Hoje uma única chamada tenta trazer notas, pedidos, contatos e estoque em série. Quando o tempo da
execução acaba, a chamada morre no meio (erro 504) e o que faltou só entra na próxima. Além disso,
quando o cadastro automático do cliente vindo do Bling falha, a nota entra **sem cliente vinculado**
e ninguém é avisado.

O que fazer:
- Cadastro de cliente que falha passa a tentar de novo (2 tentativas com pausa curta). Se ainda falhar,
  a nota/pedido não é gravado sem cliente — vai para o registro de erro da sincronização, com o motivo real.
- Cada execução passa a ter um teto de tempo e sai gravando onde parou, como já acontece na
  sincronização de expedições. Nada de execução que morre sem deixar rastro.
- O resultado da execução passa a dizer quantos registros ficaram pendentes para a próxima rodada.

Risco: mexe na rotina que alimenta as telas financeiras. Depois de aplicar, vale rodar uma
sincronização manual e conferir o registro de erros.

## 2. Cartões de "Vencido" ignoram os filtros da tela

Em Recebíveis e na aba Títulos, os cartões "Vencido — cobrável", "Em carência bancária" e a barra de
atraso mostram sempre o total da empresa inteira, mesmo com filtro de período, banco, carteira ou busca
ativos. Clicando no cartão, a lista que abre respeita os filtros — então o número do cartão e a
quantidade de linhas não batem.

O que fazer:
- Os números de vencido passam a ser somados apenas sobre os títulos que estão na tela depois dos
  filtros, cruzando a lista filtrada com a fonte única de vencido (que continua sendo a única a decidir
  quem está vencido — nenhuma tela vai calcular atraso por conta própria).
- Mesmo tratamento nas duas telas, para o cartão, a sublinha e a barra de faixas de atraso.

Efeito visível: com filtro ativo, o cartão passa a mostrar menos que o total da empresa. É a intenção —
hoje ele promete um número e entrega outro ao clicar.

## Detalhes técnicos

1. `supabase/functions/sync-bling-financeiro/`: `resolveParceiroId` em `sync-nfe.ts` e `sync-pedidos.ts`
   ganha retry (2x, backoff 400ms) e passa a lançar em vez de retornar `null` silencioso; o chamador
   conta como erro na `integracoes_sync_log`. `index.ts` recebe orçamento de tempo por execução
   (`timeUp()` já existe nos módulos) e cursor persistido por entidade, respondendo `pendente: true`.
2. `useTituloEstadoKpis.ts`: expor `agregar` (ou uma variante `useTituloEstadoKpisDe(ids: Set<string>)`)
   para agregar apenas os `titulo_id` presentes na base filtrada. `ContasReceber.tsx` passa os ids de
   `baseFiltros`; `TitulosTab.tsx` passa os de `baseSemCards`. Sem novo cálculo de data no TSX.
