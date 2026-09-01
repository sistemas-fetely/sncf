import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * FONTE ÚNICA DE VERDADE DA INVALIDAÇÃO DO RECEBÍVEL.
 *
 * Contexto (bug real de produção): `solicitar_reemissao_boleto` invalidava só
 * `["titulos-cobranca"]`. A tela Banco Safra lê `["boletos-safra"]` — ninguém
 * invalidava. Com `staleTime: Infinity` e `refetchOnWindowFocus: false` no
 * QueryClient global, a tela mentiu INDEFINIDAMENTE (boleto "Rejeitado" com
 * vencimento antigo) até F5 manual. Esquecer uma key não gera erro: FAIL-SILENT.
 *
 * REGRA: nenhuma mutation do domínio recebível (título, boleto, remessa,
 * ocorrência de retorno) invalida keys à mão. Toda ela chama este hook.
 * Query nova no domínio = adicionar o prefixo aqui, e só aqui.
 *
 * Invalidação por PREDICADO sobre o primeiro elemento da key — nenhuma key
 * precisou ser renomeada.
 *
 * Onde cada prefixo foi encontrado:
 * - boletos-safra .................. src/pages/administrativo/BancoSafra.tsx (titulo_a_receber)
 * - banco-safra-boletos ............ src/hooks/credito/useEnviarEmailBoleto.ts (key legada invalidada à mão)
 * - titulos-cobranca ............... src/hooks/credito/useTitulosCobranca.ts (vw_titulos_cobranca), src/hooks/credito/useReguaFila.ts
 * - cobranca-mesa .................. src/pages/Credito/MesaCobranca.tsx (vw_cobranca_mesa), src/pages/Credito/CobrancaFila.tsx
 * - baixas-pendentes ............... src/hooks/credito/useBaixasPendentes.ts (vw_fila_baixas_pendentes)
 * - remessas-safra ................. src/hooks/credito/useRemessasSafra.ts (remessas_safra)
 * - remessa-safra-titulos .......... src/pages/Credito/CobrancaFila.tsx (títulos de uma remessa)
 * - safra-retorno-pendente ......... src/components/financeiro/RetornoSafraPainel.tsx (vw_safra_retorno_pendente)
 * - safra-retorno-arquivos ......... src/components/financeiro/RetornoSafraPainel.tsx (safra_retorno_arquivo)
 * - safra-retorno-sequencia ........ src/components/financeiro/RetornoSafraPainel.tsx (vw_safra_retorno_sequencia)
 * - titulos-boleto ................. src/hooks/credito/useTitulosBoleto.ts (titulo_a_receber)
 * - todos-titulos .................. src/hooks/credito/useTodosTitulos.ts (titulo_a_receber)
 * - boleto-vencimento-conferencia .. src/hooks/credito/useBoletoVencimentoConferencia.ts (vw_boleto_vencimento_conferencia)
 * - contas-receber-titulos ......... src/pages/Credito/ContasReceberSops.tsx (titulo_a_receber)
 * - recebivel-gestao ............... src/pages/administrativo/ContasReceber.tsx (vw_recebivel_gestao) [arquivo não editado]
 * - recebivel-b2c-pedido ........... src/pages/administrativo/ContasReceber.tsx [arquivo não editado]
 * - titulos-pedido-resumo .......... src/hooks/credito/useTitulosPedidoResumo.ts
 * - pedido-titulos ................. src/hooks/pedidos/usePedidoTitulos.ts
 * - boletos-do-pedido .............. src/hooks/pedidos/useBoletosDoPedido.ts
 * - titulo-eixos-pedido ............ src/hooks/pedidos/useTituloEixosPedido.ts
 * - cliente-detalhe ................ src/hooks/credito/useClienteDetalhe.ts
 * - regua-log ...................... src/hooks/credito/useReguaFila.ts (histórico da régua do título)
 */
export const PREFIXOS_QUERY_RECEBIVEL: readonly string[] = [
  "boletos-safra",
  "banco-safra-boletos",
  "titulos-cobranca",
  "cobranca-mesa",
  "baixas-pendentes",
  "remessas-safra",
  "remessa-safra-titulos",
  "safra-retorno-pendente",
  "safra-retorno-arquivos",
  "safra-retorno-sequencia",
  "titulos-boleto",
  "todos-titulos",
  "boleto-vencimento-conferencia",
  "contas-receber-titulos",
  "recebivel-gestao",
  "recebivel-b2c-pedido",
  "titulos-pedido-resumo",
  "pedido-titulos",
  "boletos-do-pedido",
  "titulo-eixos-pedido",
  "cliente-detalhe",
  "regua-log",
] as const;

/**
 * REDE DE PROTEÇÃO das queries do domínio recebível.
 * Sem isso, um único esquecimento de invalidação faz a tela mentir para sempre
 * (QueryClient global usa `staleTime: Infinity` e não refaz fetch no foco).
 * O momento em que o operador volta para a aba é exatamente o momento em que
 * ele vai agir sobre o dado — então ali o dado precisa estar fresco.
 */
export const OPCOES_QUERY_RECEBIVEL = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
} as const;

/**
 * Retorna a função de invalidação do domínio. FAIL-LOUD: sempre `await`,
 * erro propaga — nada de fire-and-forget.
 */
export function useInvalidarRecebivel() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await qc.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        PREFIXOS_QUERY_RECEBIVEL.includes(q.queryKey[0]),
    });
  }, [qc]);
}
