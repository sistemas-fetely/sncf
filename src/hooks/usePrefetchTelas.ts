import { useEffect } from "react";

/**
 * Pré-carrega chunks lazy das telas mais usadas em idle (após login).
 * Antes só rodava em AppLayout (People) — agora é compartilhado por todos
 * os layouts protegidos pra que navegar entre sistemas (SNCF, Financeiro,
 * Administrativo, TI…) seja instantâneo após os primeiros segundos.
 *
 * Idempotente: chamar em múltiplos layouts não duplica downloads — Vite
 * cacheia o módulo no primeiro import().
 */
let jaPrefetched = false;

export function usePrefetchTelas() {
  useEffect(() => {
    if (jaPrefetched) return;
    jaPrefetched = true;

    // ===== ONDA 1 (50ms): telas mais frequentes =====
    const onda1 = setTimeout(() => {
      // Portal + transversais
      void import("@/pages/PortalSNCF");
      void import("@/pages/FalaFetely");

      // Financeiro/Administrativo (alto volume)
      // DESMONTE-PROJECOES (23/08/2026): InvestimentoLancamento/FluxoFuturoInvestimento/FluxoCaixaFuturo removidos
      void import("@/pages/administrativo/ContasPagar");
      void import("@/pages/administrativo/ContasReceber");
      void import("@/pages/administrativo/CaixaBanco");
      void import("@/pages/administrativo/PlanoDeContas");
      void import("@/pages/administrativo/Parceiros");
      void import("@/pages/administrativo/DashboardFinanceiro");
      void import("@/pages/administrativo/Contratos");
      void import("@/pages/administrativo/GED");
      void import("@/components/ged/PastaDetalhe");

      // People
      void import("@/pages/Dashboard");
      void import("@/pages/Colaboradores");
      void import("@/pages/Pessoas");
    }, 50);

    // ===== ONDA 2 (1500ms): telas secundárias =====
    const onda2 = setTimeout(() => {
      void import("@/pages/administrativo/FluxoCaixa");
      void import("@/pages/administrativo/Compromissos");
      void import("@/pages/administrativo/NFsStage");
      void import("@/pages/administrativo/FaturasCartao");
      void import("@/pages/administrativo/ImportarDados");
      void import("@/pages/Movimentacoes");
      
      void import("@/pages/Ferias");
      void import("@/pages/Processos");
      void import("@/pages/DocumentacaoGeral");
      void import("@/pages/Parametros");

      // Layouts (chunks distintos por layout)
      void import("@/layouts/AdministrativoLayout");
      void import("@/layouts/AdminLayout");
      void import("@/layouts/TILayout");
      void import("@/components/AppLayout");
    }, 1500);

    return () => {
      clearTimeout(onda1);
      clearTimeout(onda2);
    };
  }, []);
}
