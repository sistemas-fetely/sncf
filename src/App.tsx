import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Colaboradores from "@/pages/Colaboradores";
import Pessoas from "@/pages/Pessoas";
import ColaboradorDetalhe from "@/pages/ColaboradorDetalhe";
import { CadastroColaboradorCLTWrapper } from "@/components/colaborador-clt/CadastroColaboradorCLT";
import PlaceholderPage from "@/pages/PlaceholderPage";
import Organograma from "@/pages/Organograma";
import Login from "@/pages/Login";
import RecuperarSenha from "@/pages/RecuperarSenha";
import ResetPassword from "@/pages/ResetPassword";
import SemPermissao from "@/pages/SemPermissao";
import AguardandoAprovacao from "@/pages/AguardandoAprovacao";
import GerenciarUsuarios from "@/pages/GerenciarUsuarios";
import NotFound from "@/pages/NotFound";
import Parametros from "@/pages/Parametros";
import ContratosPJ from "@/pages/ContratosPJ";
import ContratoPJDetalhe from "@/pages/ContratoPJDetalhe";
import { CadastroContratoPJ } from "@/components/contrato-pj/CadastroContratoPJ";
import { CadastroManualContratoPJ } from "@/components/contrato-pj/CadastroManualContratoPJ";
import NotasFiscais from "@/pages/NotasFiscais";
import NotaFiscalDetalhe from "@/pages/NotaFiscalDetalhe";
import FolhaPagamento from "@/pages/FolhaPagamento";
import Ferias from "@/pages/Ferias";
import FeriasColaborador from "@/pages/FeriasColaborador";
import Beneficios from "@/pages/Beneficios";
import Movimentacoes from "@/pages/Movimentacoes";
import PagamentosPJ from "@/pages/PagamentosPJ";
import PagamentoPJRelatorio from "@/pages/PagamentoPJRelatorio";
import CadastroPublico from "@/pages/CadastroPublico";
import ConvitesCadastro from "@/pages/ConvitesCadastro";
import ConviteDetalhe from "@/pages/ConviteDetalhe";
import Unsubscribe from "@/pages/Unsubscribe";
import ConfigurarPerfis from "@/pages/ConfigurarPerfis";
import Onboarding from "@/pages/Onboarding";
import OnboardingDetalhe from "@/pages/OnboardingDetalhe";
import Recrutamento from "@/pages/Recrutamento";
import RecrutamentoDetalhe from "@/pages/RecrutamentoDetalhe";
import PortalCandidatura from "@/pages/PortalCandidatura";
import VagaPublica from "@/pages/VagaPublica";
import Cargos from "@/pages/Cargos";
import CargoForm from "@/pages/CargoForm";
import CargosEnriquecimento from "@/pages/CargosEnriquecimento";
import EntregaTeste from "@/pages/EntregaTeste";
import PortalSNCF from "@/pages/PortalSNCF";
import TILayout from "@/layouts/TILayout";
import AdminLayout from "@/layouts/AdminLayout";
import SNCFLayout from "@/layouts/SNCFLayout";
import AdministrativoLayout from "@/layouts/AdministrativoLayout";
import GestaoVistaLayout from "@/layouts/GestaoVistaLayout";
import ProdutoLayout from "@/layouts/ProdutoLayout";
import ProdutoIndex from "@/pages/produto/ProdutoIndex";
import TIDashboard from "@/pages/ti/TIDashboard";
import TIAtivos from "@/pages/ti/TIAtivos";

import DocumentacaoDetalhe from "@/pages/ti/DocumentacaoDetalhe";
import DocumentacaoForm from "@/pages/ti/DocumentacaoForm";
import MinhasTarefas from "@/pages/MinhasTarefas";
import TarefasDoTime from "@/pages/TarefasDoTime";
import Processos from "@/pages/Processos";
import ProcessoDetalhe from "@/pages/ProcessoDetalhe";
import ProcessoEditor from "@/pages/ProcessoEditor";
import ImportarProcessoPdf from "@/pages/processos/ImportarProcessoPdf";
import DesligamentoDetalhe from "@/pages/DesligamentoDetalhe";
import FalaFetely from "@/pages/FalaFetely";
import FalaFetelyConhecimento from "@/pages/fala-fetely/Conhecimento";
import MinhasMemorias from "@/pages/fala-fetely/MinhasMemorias";
import MeusDados from "@/pages/MeusDados";
import MeusAcessos from "@/pages/MeusAcessos";
import MinhasNotas from "@/pages/MinhasNotas";
import SistemaReportes from "@/pages/admin/SistemaReportes";
import HistoricoImportacoesPDF from "@/pages/admin/HistoricoImportacoesPDF";
import GestaoAVista from "@/pages/GestaoAVista";
import DocumentacaoGeral from "@/pages/DocumentacaoGeral";
import AdminFinanceiroLayout from "@/layouts/AdminFinanceiroLayout";
import PlanoDeContas from "@/pages/administrativo/PlanoDeContas";

import FluxoCaixa from "@/pages/administrativo/FluxoCaixa";
import ContasPagar from "@/pages/administrativo/ContasPagar";
import ContasReceber from "@/pages/administrativo/ContasReceber";
import Parceiros from "@/pages/administrativo/Parceiros";
import ImportarDados from "@/pages/administrativo/ImportarDados";
import NFsStage from "@/pages/administrativo/NFsStage";
import FaturasCartao from "@/pages/administrativo/FaturasCartao";
import ReconciliacaoCartao from "@/pages/administrativo/ReconciliacaoCartao";
import FluxoCaixaFuturo from "@/pages/administrativo/FluxoCaixaFuturo";
import Compromissos from "@/pages/administrativo/Compromissos";
import DocumentosPendentes from "@/pages/administrativo/DocumentosPendentes";
import AdminContratos from "@/pages/administrativo/Contratos";
import AdminImoveis from "@/pages/administrativo/Imoveis";
import AdminSeguros from "@/pages/administrativo/Seguros";
import AdminGED from "@/pages/administrativo/GED";
import ConfiguracaoIntegracao from "@/pages/administrativo/ConfiguracaoIntegracao";
import BlingCallback from "@/pages/administrativo/BlingCallback";
import PedidosVenda from "@/pages/administrativo/PedidosVenda";
import Produtos from "@/pages/administrativo/Produtos";
import CaixaBanco from "@/pages/administrativo/CaixaBanco";
import ContasBancarias from "@/pages/administrativo/ContasBancarias";
import OFXStage from "@/pages/administrativo/OFXStage";
import DashboardFinanceiro from "@/pages/administrativo/DashboardFinanceiro";
import InvestimentoLancamento from "@/pages/administrativo/InvestimentoLancamento";

const queryClient = new QueryClient();

// Redirect dinâmico: /ti/documentacao/:slug → /documentacao/:slug
function TiDocSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/documentacao/${slug}`} replace />;
}

// Wrappers de compatibilidade: rotas antigas redirecionam pra /pessoas com filtro aplicado
function RedirectToPessoasCLT() {
  return <Navigate to="/pessoas?tipo=CLT" replace />;
}
function RedirectToPessoasPJ() {
  return <Navigate to="/pessoas?tipo=PJ" replace />;
}

// Redirects para rotas legadas migradas para /admin
function CargosIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/cargos/${id}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/recuperar-senha" element={<RecuperarSenha />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/sem-permissao" element={<SemPermissao />} />
            <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
            <Route path="/cadastro/:token" element={<CadastroPublico />} />
            <Route path="/vagas/:id" element={<VagaPublica />} />
            <Route path="/vagas/:id/candidatura" element={<PortalCandidatura />} />
            <Route path="/vagas/:id/teste" element={<EntregaTeste />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />

            {/* SNCF — Portal + transversais (Tarefas, Templates, Usuários) */}
            <Route element={<ProtectedRoute><SNCFLayout /></ProtectedRoute>}>
              <Route path="/sncf" element={<PortalSNCF />} />
              <Route path="/tarefas" element={<MinhasTarefas />} />
              <Route path="/tarefas/time" element={<TarefasDoTime />} />
              <Route path="/gerenciar-usuarios" element={<Navigate to="/admin/usuarios" replace />} />
              <Route path="/gerenciar-usuarios/perfis" element={<Navigate to="/admin/usuarios/perfis" replace />} />
              <Route path="/processos" element={<Processos />} />
              <Route path="/processos/importar" element={
                <ProtectedRoute allowedRoles={["super_admin", "admin_rh"]}>
                  <ImportarProcessoPdf />
                </ProtectedRoute>
              } />
              <Route path="/processos/:id" element={<ProcessoDetalhe />} />
              <Route path="/processos/:id/editar" element={<ProcessoEditor />} />
              <Route path="/templates" element={<Navigate to="/processos" replace />} />
              <Route path="/templates/*" element={<Navigate to="/processos" replace />} />
              <Route path="/fala-fetely" element={<FalaFetely />} />
              <Route path="/fala-fetely/conhecimento" element={<FalaFetelyConhecimento />} />
              <Route path="/fala-fetely/memorias" element={<MinhasMemorias />} />
              <Route path="/meus-dados" element={<MeusDados />} />
              <Route path="/meus-acessos" element={<MeusAcessos />} />
              <Route path="/minhas-notas" element={<MinhasNotas />} />
              {/* Documentação transversal — antes ficava em /ti/documentacao */}
              <Route path="/documentacao" element={<DocumentacaoGeral />} />
              <Route path="/documentacao/novo" element={<DocumentacaoForm />} />
              <Route path="/documentacao/:slug" element={<DocumentacaoDetalhe />} />
            </Route>

            {/* TI Fetely */}
            <Route path="/ti" element={<ProtectedRoute><TILayout /></ProtectedRoute>}>
              <Route index element={<TIDashboard />} />
              <Route path="ativos" element={<TIAtivos />} />
              {/* Redirects legados — documentação migrou pra SNCF */}
              <Route path="documentacao" element={<Navigate to="/documentacao" replace />} />
              <Route path="documentacao/novo" element={<Navigate to="/documentacao/novo" replace />} />
              <Route path="documentacao/:slug" element={<TiDocSlugRedirect />} />
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/sncf" replace />} />
              {/* /dashboard, /gestao-a-vista, /relatorios MIGRADOS pra GestaoVistaLayout (Sprint 2 — 29/04/2026) */}
              <Route path="/desligamento/:id" element={<DesligamentoDetalhe />} />
              <Route path="/pessoas" element={<Pessoas />} />
              <Route path="/colaboradores" element={
                <ProtectedRoute permModule="colaboradores">
                  <RedirectToPessoasCLT />
                </ProtectedRoute>
              } />
              <Route path="/colaboradores/novo" element={
                <ProtectedRoute permModule="colaboradores" permAction="create">
                  <CadastroColaboradorCLTWrapper />
                </ProtectedRoute>
              } />
              <Route path="/colaboradores/:id" element={
                <ProtectedRoute permModule="colaboradores">
                  <ColaboradorDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/organograma" element={
                <ProtectedRoute permModule="organograma">
                  <Organograma />
                </ProtectedRoute>
              } />
              <Route path="/movimentacoes" element={
                <ProtectedRoute permModule="movimentacoes">
                  <Movimentacoes />
                </ProtectedRoute>
              } />

              {/* CLT */}
              <Route path="/folha-pagamento" element={
                <ProtectedRoute permModule="folha_pagamento">
                  <FolhaPagamento />
                </ProtectedRoute>
              } />
              <Route path="/ferias" element={
                <ProtectedRoute permModule="ferias">
                  <Ferias />
                </ProtectedRoute>
              } />
              <Route path="/ferias/colaborador/:id" element={
                <ProtectedRoute permModule="ferias">
                  <FeriasColaborador />
                </ProtectedRoute>
              } />
              <Route path="/ponto" element={
                <ProtectedRoute permModule="folha_pagamento">
                  <PlaceholderPage title="Controle de Ponto" description="Apuração de horas e banco de horas" />
                </ProtectedRoute>
              } />
              <Route path="/beneficios" element={
                <ProtectedRoute permModule="beneficios">
                  <Beneficios />
                </ProtectedRoute>
              } />

              {/* PJ */}
              <Route path="/contratos-pj" element={
                <ProtectedRoute permModule="contratos_pj">
                  <RedirectToPessoasPJ />
                </ProtectedRoute>
              } />
              <Route path="/contratos-pj/novo" element={
                <ProtectedRoute permModule="contratos_pj" permAction="create">
                  <CadastroContratoPJ />
                </ProtectedRoute>
              } />
              <Route path="/contratos-pj/novo-manual" element={
                <ProtectedRoute permModule="contratos_pj" permAction="create">
                  <CadastroManualContratoPJ />
                </ProtectedRoute>
              } />
              <Route path="/contratos-pj/:id" element={
                <ProtectedRoute permModule="contratos_pj">
                  <ContratoPJDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/notas-fiscais" element={
                <ProtectedRoute permModule="notas_fiscais">
                  <NotasFiscais />
                </ProtectedRoute>
              } />
              <Route path="/notas-fiscais/:id" element={
                <ProtectedRoute permModule="notas_fiscais">
                  <NotaFiscalDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/pagamentos-pj" element={
                <ProtectedRoute permModule="pagamentos_pj">
                  <PagamentosPJ />
                </ProtectedRoute>
              } />
              <Route path="/pagamentos-pj/:contratoId" element={
                <ProtectedRoute permModule="pagamentos_pj">
                  <PagamentoPJRelatorio />
                </ProtectedRoute>
              } />

              {/* RH */}
              <Route path="/convites-cadastro" element={
                <ProtectedRoute permModule="convites">
                  <ConvitesCadastro />
                </ProtectedRoute>
              } />
              <Route path="/convites-cadastro/:id" element={
                <ProtectedRoute permModule="convites">
                  <ConviteDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/onboarding" element={
                <ProtectedRoute permModule="convites">
                  <Onboarding />
                </ProtectedRoute>
              } />
              <Route path="/onboarding/:id" element={
                <ProtectedRoute permModule="convites">
                  <OnboardingDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/recrutamento" element={
                <ProtectedRoute permModule="recrutamento">
                  <Recrutamento />
                </ProtectedRoute>
              } />
              <Route path="/recrutamento/:id" element={
                <ProtectedRoute permModule="recrutamento">
                  <RecrutamentoDetalhe />
                </ProtectedRoute>
              } />
              <Route path="/avaliacoes" element={
                <ProtectedRoute permModule="avaliacoes">
                  <PlaceholderPage title="Avaliações de Desempenho" description="Ciclos de avaliação e PDI" />
                </ProtectedRoute>
              } />
              <Route path="/treinamentos" element={
                <ProtectedRoute permModule="treinamentos">
                  <PlaceholderPage title="Treinamentos" description="Controle de capacitação e certificados" />
                </ProtectedRoute>
              } />
              {/* /relatorios MIGRADO pra GestaoVistaLayout (Sprint 2 — 29/04/2026) */}

              {/* Redirects legados → Admin */}
              <Route path="/parametros" element={<Navigate to="/admin/parametros" replace />} />
              <Route path="/configuracoes" element={<Navigate to="/admin/configuracoes" replace />} />
              <Route path="/configurar-perfis" element={<Navigate to="/admin/usuarios/perfis" replace />} />
              <Route path="/cargos" element={<Navigate to="/admin/cargos" replace />} />
              <Route path="/cargos/enriquecimento" element={<Navigate to="/admin/cargos/enriquecimento" replace />} />
              <Route path="/cargos/novo" element={<Navigate to="/admin/cargos/novo" replace />} />
              <Route path="/cargos/:id" element={<CargosIdRedirect />} />
              </Route>

            {/* ═══════════════════════════════════════════════
                Administração (zona restrita: super_admin + admin_rh)
                ═══════════════════════════════════════════════ */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/cargos" replace />} />
              <Route path="cargos" element={
                <ProtectedRoute permModule="parametros"><Cargos /></ProtectedRoute>
              } />
              <Route path="cargos/novo" element={
                <ProtectedRoute permModule="parametros"><CargoForm /></ProtectedRoute>
              } />
              <Route path="cargos/enriquecimento" element={
                <ProtectedRoute permModule="parametros"><CargosEnriquecimento /></ProtectedRoute>
              } />
              <Route path="cargos/:id" element={
                <ProtectedRoute permModule="parametros"><CargoForm /></ProtectedRoute>
              } />
              <Route path="parametros" element={
                <ProtectedRoute permModule="parametros"><Parametros /></ProtectedRoute>
              } />
              <Route path="configuracoes" element={
                <ProtectedRoute permModule="usuarios">
                  <PlaceholderPage title="Configurações" description="Parâmetros do sistema e permissões" />
                </ProtectedRoute>
              } />
              <Route path="usuarios" element={
                <ProtectedRoute permModule="usuarios"><GerenciarUsuarios /></ProtectedRoute>
              } />
              <Route path="usuarios/perfis" element={
                <ProtectedRoute permModule="usuarios"><ConfigurarPerfis /></ProtectedRoute>
              } />
              <Route path="reportes" element={
                <ProtectedRoute allowedRoles={["super_admin", "admin_rh"]}>
                  <SistemaReportes />
                </ProtectedRoute>
              } />
              <Route path="importacoes-pdf" element={
                <ProtectedRoute allowedRoles={["super_admin", "admin_rh"]}>
                  <HistoricoImportacoesPDF />
                </ProtectedRoute>
              } />
            </Route>

            {/* Bling OAuth callback — rota independente, fora do layout */}
            <Route path="/administrativo/bling-callback" element={<BlingCallback />} />

            {/* ═══════════════════════════════════════════════
                Pilar Administrativo (Financeiro, Contratos, Imóveis, Seguros, GED)
                Acesso restrito a super_admin (Fase 1)
                ═══════════════════════════════════════════════ */}
            <Route path="/administrativo" element={<AdminFinanceiroLayout />}>
              <Route index element={<DashboardFinanceiro />} />
              <Route path="plano-contas" element={<PlanoDeContas />} />
              <Route path="investimento-lancamento" element={<InvestimentoLancamento />} />

              <Route path="fluxo-caixa" element={<FluxoCaixa />} />
              <Route path="contas-pagar" element={<ContasPagar />} />
              <Route path="caixa-banco" element={<CaixaBanco />} />
              <Route path="caixa-banco/contas" element={<ContasBancarias />} />
              <Route path="ofx-stage" element={<OFXStage />} />
              <Route path="contas-receber" element={<ContasReceber />} />
              <Route path="parceiros" element={<Parceiros />} />
              <Route path="importar" element={<ImportarDados />} />
              <Route path="nfs-stage" element={<NFsStage />} />
              <Route path="documentos-pendentes" element={<DocumentosPendentes />} />
              <Route path="faturas-cartao" element={<FaturasCartao />} />
              <Route path="reconciliacao-cartao" element={<ReconciliacaoCartao />} />
              <Route path="fluxo-futuro" element={<FluxoCaixaFuturo />} />
              <Route path="compromissos" element={<Compromissos />} />
              <Route path="configuracao-integracao" element={<ConfiguracaoIntegracao />} />
              {/* MIGRADOS na Sprint 2 (29/04/2026) → Administrativo Fetely:
                  pedidos, produtos, contratos, imoveis, seguros, ged.
                  Redirects logo abaixo mantêm compatibilidade com URLs antigas. */}
              <Route path="pedidos" element={<Navigate to="/administrativo-fetely/pedidos" replace />} />
              <Route path="produtos" element={<Navigate to="/administrativo-fetely/produtos" replace />} />
              <Route path="contratos" element={<Navigate to="/administrativo-fetely/contratos" replace />} />
              <Route path="imoveis" element={<Navigate to="/administrativo-fetely/imoveis" replace />} />
              <Route path="seguros" element={<Navigate to="/administrativo-fetely/seguros" replace />} />
              <Route path="ged" element={<Navigate to="/administrativo-fetely/ged" replace />} />
            </Route>

            {/* ═══════════════════════════════════════════════
                ADMINISTRATIVO FETELY — Pilar novo (Sprint 2 — 29/04/2026)
                Recebe Contratos, Imóveis, Seguros, GED + Pedidos/Produtos (provisórios)
                ═══════════════════════════════════════════════ */}
            <Route path="/administrativo-fetely" element={<AdministrativoLayout />}>
              <Route index element={<Navigate to="/administrativo-fetely/contratos" replace />} />
              <Route path="contratos" element={<AdminContratos />} />
              <Route path="imoveis" element={<AdminImoveis />} />
              <Route path="seguros" element={<AdminSeguros />} />
              <Route path="ged" element={<AdminGED />} />
              <Route path="pedidos" element={<PedidosVenda />} />
              <Route path="produtos" element={<Produtos />} />
            </Route>

            {/* ═══════════════════════════════════════════════
                GESTÃO À VISTA — Sistema novo (Sprint 2 — 29/04/2026)
                Recebe Dashboard + Relatórios (vindos do People).
                URLs preservadas (/dashboard, /relatorios) — só layout muda.
                ═══════════════════════════════════════════════ */}
            <Route element={<ProtectedRoute><GestaoVistaLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/gestao-a-vista" element={<GestaoAVista />} />
              <Route path="/relatorios" element={
                <ProtectedRoute permModule="relatorios">
                  <PlaceholderPage title="Relatórios e BI" description="Relatórios gerenciais e exportação" />
                </ProtectedRoute>
              } />
            </Route>

            {/* ═══════════════════════════════════════════════
                PRODUTO FETELY — Sistema novo placeholder (Sprint 2 — 29/04/2026)
                ═══════════════════════════════════════════════ */}
            <Route path="/produto" element={<ProtectedRoute><ProdutoLayout /></ProtectedRoute>}>
              <Route index element={<ProdutoIndex />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
