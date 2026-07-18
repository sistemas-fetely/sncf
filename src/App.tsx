import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RotaGate } from "@/components/RotaGate";
import { PrimeiroAcessoOverlay } from "@/components/PrimeiroAcessoOverlay";

// Layouts — importados diretamente (não lazy) para evitar Suspense na raiz e soluço de navegação.
// Layouts são pequenos (~30-80L cada) e não justificam code-splitting.
import { AppLayout } from "@/components/AppLayout";
import AdminFinanceiroLayout from "@/layouts/AdminFinanceiroLayout";
const FinancasLayout = lazy(() => import("./layouts/FinancasLayout"));
import AdministrativoLayout from "@/layouts/AdministrativoLayout";
import TILayout from "@/layouts/TILayout";
import AdminLayout from "@/layouts/AdminLayout";
import SNCFLayout from "@/layouts/SNCFLayout";
import GestaoVistaLayout from "@/layouts/GestaoVistaLayout";
import PublicLayout from "@/layouts/PublicLayout";
import AcervoLayout from "@/layouts/AcervoLayout";
import { CasaLayout } from "@/layouts/CasaLayout";

// Lazy-loaded routes — reduces initial bundle (was ~1.3MB) to improve TBT/Max FID.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CasaHome = lazy(() => import("@/pages/CasaHome"));
const Colaboradores = lazy(() => import("@/pages/Colaboradores"));
const Pessoas = lazy(() => import("@/pages/Pessoas"));
const PessoaForm = lazy(() => import("@/pages/PessoaForm"));
const ColaboradorDetalhe = lazy(() => import("@/pages/ColaboradorDetalhe"));
const CadastroColaboradorCLTWrapper = lazy(() => import("@/components/colaborador-clt/CadastroColaboradorCLT").then(m => ({ default: m.CadastroColaboradorCLTWrapper })));
const PlaceholderPage = lazy(() => import("@/pages/PlaceholderPage"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Organograma = lazy(() => import("@/pages/Organograma"));
const Login = lazy(() => import("@/pages/Login"));
const RecuperarSenha = lazy(() => import("@/pages/RecuperarSenha"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const DefinirSenha = lazy(() => import("@/pages/DefinirSenha"));
const SemPermissao = lazy(() => import("@/pages/SemPermissao"));
const AguardandoAprovacao = lazy(() => import("@/pages/AguardandoAprovacao"));
const GerenciarUsuarios = lazy(() => import("@/pages/GerenciarUsuarios"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const RastreamentoCorreios = lazy(() => import("@/pages/RastreamentoCorreios"));
const FaturasCorreios = lazy(() => import("@/pages/FaturasCorreios"));
const Parametros = lazy(() => import("@/pages/Parametros"));
const ContratosPJ = lazy(() => import("@/pages/ContratosPJ"));
const ContratoPJDetalhe = lazy(() => import("@/pages/ContratoPJDetalhe"));
const CadastroContratoPJ = lazy(() => import("@/components/contrato-pj/CadastroContratoPJ").then(m => ({ default: m.CadastroContratoPJ })));
const CadastroManualContratoPJ = lazy(() => import("@/components/contrato-pj/CadastroManualContratoPJ").then(m => ({ default: m.CadastroManualContratoPJ })));
const NotasFiscais = lazy(() => import("@/pages/NotasFiscais"));
const NotaFiscalDetalhe = lazy(() => import("@/pages/NotaFiscalDetalhe"));
const FolhaPagamento = lazy(() => import("@/pages/FolhaPagamento"));
const Ferias = lazy(() => import("@/pages/Ferias"));
const FeriasColaborador = lazy(() => import("@/pages/FeriasColaborador"));
const Beneficios = lazy(() => import("@/pages/Beneficios"));
const Movimentacoes = lazy(() => import("@/pages/Movimentacoes"));
const PagamentosPJ = lazy(() => import("@/pages/PagamentosPJ"));
const PagamentoPJRelatorio = lazy(() => import("@/pages/PagamentoPJRelatorio"));
const CadastroPublico = lazy(() => import("@/pages/CadastroPublico"));
const ConvitesCadastro = lazy(() => import("@/pages/ConvitesCadastro"));
const ConviteDetalhe = lazy(() => import("@/pages/ConviteDetalhe"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const ConfigurarPerfis = lazy(() => import("@/pages/ConfigurarPerfis"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const OnboardingDetalhe = lazy(() => import("@/pages/OnboardingDetalhe"));
const Recrutamento = lazy(() => import("@/pages/Recrutamento"));
const RecrutamentoDetalhe = lazy(() => import("@/pages/RecrutamentoDetalhe"));
const PortalCandidatura = lazy(() => import("@/pages/PortalCandidatura"));
const VagaPublica = lazy(() => import("@/pages/VagaPublica"));
const Cargos = lazy(() => import("@/pages/Cargos"));
const CargoForm = lazy(() => import("@/pages/CargoForm"));
const CargosEnriquecimento = lazy(() => import("@/pages/CargosEnriquecimento"));
const EntregaTeste = lazy(() => import("@/pages/EntregaTeste"));
const PortalSNCF = lazy(() => import("@/pages/PortalSNCF"));
const Compras = lazy(() => import("@/pages/Compras"));
const ComprasAComprar = lazy(() => import("@/pages/ComprasAComprar"));
const TIDashboard = lazy(() => import("@/pages/ti/TIDashboard"));
const TIAtivos = lazy(() => import("@/pages/ti/TIAtivos"));
const TesteEmailTemplate = lazy(() => import("@/pages/ti/TesteEmailTemplate"));
const DocumentacaoDetalhe = lazy(() => import("@/pages/ti/DocumentacaoDetalhe"));
const DocumentacaoForm = lazy(() => import("@/pages/ti/DocumentacaoForm"));
const MinhasTarefas = lazy(() => import("@/pages/MinhasTarefas"));
const TarefasDoTime = lazy(() => import("@/pages/TarefasDoTime"));
const Processos = lazy(() => import("@/pages/Processos"));
const ProcessoDetalhe = lazy(() => import("@/pages/ProcessoDetalhe"));
const ProcessoEditor = lazy(() => import("@/pages/ProcessoEditor"));
const ImportarProcessoPdf = lazy(() => import("@/pages/processos/ImportarProcessoPdf"));
const DesligamentoDetalhe = lazy(() => import("@/pages/DesligamentoDetalhe"));
const FalaFetely = lazy(() => import("@/pages/FalaFetely"));
const FalaFetelyConhecimento = lazy(() => import("@/pages/fala-fetely/Conhecimento"));
const MinhasMemorias = lazy(() => import("@/pages/fala-fetely/MinhasMemorias"));
const MeusDados = lazy(() => import("@/pages/MeusDados"));
const MeusAcessos = lazy(() => import("@/pages/MeusAcessos"));
const MinhasNotas = lazy(() => import("@/pages/MinhasNotas"));
const SistemaReportes = lazy(() => import("@/pages/admin/SistemaReportes"));
const HistoricoImportacoesPDF = lazy(() => import("@/pages/admin/HistoricoImportacoesPDF"));
const GerenciarVisibilidade = lazy(() => import("@/pages/admin/GerenciarVisibilidade"));
const GestaoAVista = lazy(() => import("@/pages/GestaoAVista"));
const DocumentacaoGeral = lazy(() => import("@/pages/DocumentacaoGeral"));
const PlanoDeContas = lazy(() => import("@/pages/administrativo/PlanoDeContas"));
const FluxoCaixa = lazy(() => import("@/pages/administrativo/FluxoCaixa"));
const ContasPagar = lazy(() => import("@/pages/administrativo/ContasPagar"));
const ContasReceber = lazy(() => import("@/pages/administrativo/ContasReceber"));
const RecebimentosConciliar = lazy(() => import("@/pages/administrativo/RecebimentosConciliar"));
const PainelFinanceiroConta = lazy(() => import("@/pages/administrativo/PainelFinanceiroConta"));
const Parceiros = lazy(() => import("@/pages/administrativo/Parceiros"));
const ImportarDados = lazy(() => import("@/pages/administrativo/ImportarDados"));
const NFsStage = lazy(() => import("@/pages/administrativo/NFsStage"));
const FaturasCartao = lazy(() => import("@/pages/administrativo/FaturasCartao"));

const FluxoCaixaFuturo = lazy(() => import("@/pages/administrativo/FluxoCaixaFuturo"));
const PrevisaoRecebimentos = lazy(() => import("@/pages/administrativo/PrevisaoRecebimentos"));
const Compromissos = lazy(() => import("@/pages/administrativo/Compromissos"));
const DocumentosPendentes = lazy(() => import("@/pages/administrativo/DocumentosPendentes"));
const AdminContratos = lazy(() => import("@/pages/administrativo/Contratos"));
const AdminImoveis = lazy(() => import("@/pages/administrativo/Imoveis"));
const AdminSeguros = lazy(() => import("@/pages/administrativo/Seguros"));
const AdminGED = lazy(() => import("@/pages/administrativo/GED"));
const ConfiguracaoIntegracao = lazy(() => import("@/pages/administrativo/ConfiguracaoIntegracao"));
const BlingCallback = lazy(() => import("@/pages/administrativo/BlingCallback"));

const Produtos = lazy(() => import("@/pages/administrativo/Produtos"));
const CaixaBanco = lazy(() => import("@/pages/administrativo/CaixaBanco"));
const BancoSafra = lazy(() => import("@/pages/administrativo/BancoSafra"));
const ContasBancarias = lazy(() => import("@/pages/administrativo/ContasBancarias"));
const Conciliacao = lazy(() => import("@/pages/administrativo/Conciliacao"));
const RegrasOFX = lazy(() => import("@/pages/administrativo/RegrasOFX"));
const DashboardFinanceiro = lazy(() => import("@/pages/administrativo/DashboardFinanceiro"));
const InvestimentoLancamento = lazy(() => import("@/pages/administrativo/InvestimentoLancamento"));
const FluxoFuturoInvestimento = lazy(() => import("@/pages/administrativo/FluxoFuturoInvestimento"));
const ExtratoImportacao = lazy(() => import("@/pages/administrativo/ExtratoImportacao"));
const ExtratoInbox = lazy(() => import("@/pages/administrativo/ExtratoInbox"));
const RegrasInbox = lazy(() => import("@/pages/administrativo/RegrasInbox"));
const ParesTransferencia = lazy(() => import("@/pages/administrativo/ParesTransferencia"));

const CreditoIndex = lazy(() => import("@/pages/Credito/CreditoIndex"));
const AnaliseDetalhe = lazy(() => import("@/pages/Credito/AnaliseDetalhe"));
const ClienteDetalhe = lazy(() => import("@/pages/Credito/ClienteDetalhe"));
const CreditoClientesIndex = lazy(() => import("@/pages/Credito/CreditoClientesIndex"));
const CobrancaFila = lazy(() => import("@/pages/Credito/CobrancaFila"));
const CobrancaDetalhe = lazy(() => import("@/pages/Credito/CobrancaDetalhe"));
const AguardandoPagamentoFila = lazy(() => import("@/pages/Credito/AguardandoPagamentoFila"));
const AguardandoPagamentoDetalhe = lazy(() => import("@/pages/Credito/AguardandoPagamentoDetalhe"));
const RecebimentoLayout = lazy(() => import("@/pages/Recebimento/RecebimentoLayout"));
const RegrasCadencia = lazy(() => import("@/pages/Credito/RegrasCadencia"));
const ReguaEtapas = lazy(() => import("@/pages/Credito/ReguaEtapas"));

const PedidosIndex = lazy(() => import("@/pages/Pedidos/PedidosIndex"));
const PedidoDetalhe = lazy(() => import("@/pages/Pedidos/PedidoDetalhe"));
const ParceiroDetalhe = lazy(() => import("@/pages/Parceiros/ParceiroDetalhe"));
const EstoqueVirtual = lazy(() => import("@/pages/Comercial/EstoqueVirtual"));
const VendasLayout = lazy(() => import("@/layouts/VendasLayout"));
const NfsDeVenda = lazy(() => import("@/pages/Vendas/NfsDeVenda"));
const WnsXpm = lazy(() => import("@/pages/vendas/WnsXpm"));
const FarolPedidos = lazy(() => import("@/pages/vendas/FarolPedidos"));
const GestaoPedidos = lazy(() => import("@/pages/vendas/GestaoPedidos"));
const ShopifyB2c = lazy(() => import("@/pages/vendas/ShopifyB2c"));
const ShopifyCheckouts = lazy(() => import("@/pages/vendas/shopify/ShopifyCheckouts"));
const ShopifyProdutos = lazy(() => import("@/pages/vendas/shopify/ShopifyProdutos"));
const ShopifyClientes = lazy(() => import("@/pages/vendas/shopify/ShopifyClientes"));
const ShopifyReembolsos = lazy(() => import("@/pages/vendas/shopify/ShopifyReembolsos"));
const ShopifyFulfillments = lazy(() => import("@/pages/vendas/shopify/ShopifyFulfillments"));
const ShopifyEstoque = lazy(() => import("@/pages/vendas/shopify/ShopifyEstoque"));
const PedidosVenda = lazy(() => import("@/pages/administrativo/PedidosVenda"));
const Logistica = lazy(() => import("@/pages/logistica/Logistica"));
const CanalCPO = lazy(() => import("@/pages/CanalCPO"));
const TesteFrete = lazy(() => import("@/pages/TesteFrete"));
const TesteRastreio = lazy(() => import("@/pages/TesteRastreio"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sem revalidação automática por tempo: atualização pós-ação deve vir de
      // invalidações específicas das mutations, não de refresh global.
      staleTime: Infinity,

      // Cache em memória por 10 min após sair da tela (navegação instantânea).
      gcTime: 10 * 60 * 1000,

      // Desligado: re-buscar tudo a cada volta pra aba era a maior fonte de churn
      // e ficou redundante com a invalidação-na-escrita. Telas que precisam de
      // atualização "ao vivo" entre usuários devem usar refetchInterval por query.
      refetchOnWindowFocus: false,

      // Rebusca ao montar somente quando uma mutation marcou aquela query como stale.
      // Com staleTime Infinity, navegação normal não refaz tudo; telas afetadas por
      // ação anterior voltam atualizadas.
      refetchOnMount: true,

      // Desligado: queda/volta de rede não deve recarregar a tela sozinha.
      refetchOnReconnect: false,

      // Limita retries em caso de erro.
      retry: 1,
    },
  },
});

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
          <PrimeiroAcessoOverlay />
          <Routes>
            {/* Public routes (Suspense boundary via PublicLayout — R-01) */}
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/recuperar-senha" element={<RecuperarSenha />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/definir-senha" element={<DefinirSenha />} />
              <Route path="/sem-permissao" element={<SemPermissao />} />
              <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
              <Route path="/cadastro/:token" element={<CadastroPublico />} />
              <Route path="/vagas/:id" element={<VagaPublica />} />
              <Route path="/vagas/:id/candidatura" element={<PortalCandidatura />} />
              <Route path="/vagas/:id/teste" element={<EntregaTeste />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/teste-frete" element={<TesteFrete />} />
              <Route path="/teste-rastreio" element={<TesteRastreio />} />
            </Route>

            {/* Bling OAuth callback — público (recebe redirect externo), fora da Casa */}
            <Route path="/administrativo/bling-callback" element={<BlingCallback />} />

            {/* ═══════════════════════════════════════════════
                Casa Fetély — wrapper de auth + visual global
                Doutrina CASA-1 — substitui Regra de Ouro dos Menus.
                ═══════════════════════════════════════════════ */}
            <Route element={<ProtectedRoute><RotaGate><CasaLayout /></RotaGate></ProtectedRoute>}>
              <Route path="/" element={<CasaHome />} />

              {/* ═══════════════════════════════════════════════
                  App Crédito — App Simples (sem sidebar lateral)
                  Doutrina: Apps Simples usam CasaLayout direto.
                  ═══════════════════════════════════════════════ */}
              <Route path="/credito" element={<CreditoIndex />} />
              <Route path="/credito/analises/:id" element={<AnaliseDetalhe />} />
              <Route path="/credito/clientes" element={<CreditoClientesIndex />} />
              <Route path="/credito/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/recebimento" element={<RecebimentoLayout />}>
                <Route index element={<Navigate to="/pedidos" replace />} />
                <Route path="aguardando-pagamento" element={<AguardandoPagamentoFila />} />
              </Route>
              <Route path="/recebimento/cobranca/:pedidoId" element={<CobrancaDetalhe />} />
              <Route path="/recebimento/aguardando-pagamento/:pedidoId" element={<AguardandoPagamentoDetalhe />} />
              <Route path="/credito/regras-cadencia" element={<RegrasCadencia />} />
              <Route path="/credito/regua-etapas" element={<ReguaEtapas />} />


              {/* Detail routes (sem sidebar) */}
              <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
              <Route path="/parceiros/:id" element={<ParceiroDetalhe />} />

              {/* ═══════════════════════════════════════════════
                  App SOPs — com sidebar lateral
                  Absorve: Pedidos, Cobrança, NFs, Parceiros, Estoque Virtual
                  ═══════════════════════════════════════════════ */}
              <Route element={<VendasLayout />}>
                <Route path="/pedidos" element={<PedidosIndex />} />
                <Route path="/recebimento/cobranca" element={<CobrancaFila />} />
                <Route path="/vendas/nfs" element={<NfsDeVenda />} />
                <Route path="/vendas/bling-pedidos" element={<PedidosVenda />} />
                <Route path="/vendas/produtos" element={<Produtos />} />
                <Route path="/vendas/wns-xpm" element={<WnsXpm />} />
                <Route path="/vendas/farol-pedidos" element={<FarolPedidos />} />
                <Route path="/vendas/gestao-pedidos" element={<GestaoPedidos />} />
                <Route path="/vendas/shopify" element={<ShopifyB2c />} />
                <Route path="/vendas/shopify/checkouts" element={<ShopifyCheckouts />} />
                <Route path="/vendas/shopify/produtos" element={<ShopifyProdutos />} />
                <Route path="/vendas/shopify/clientes" element={<ShopifyClientes />} />
                <Route path="/vendas/shopify/reembolsos" element={<ShopifyReembolsos />} />
                <Route path="/vendas/shopify/fulfillments" element={<ShopifyFulfillments />} />
                <Route path="/vendas/shopify/estoque" element={<ShopifyEstoque />} />
                <Route path="/logistica" element={<Logistica />} />
                <Route path="/administrativo-fetely/parceiros" element={<Parceiros />} />
                <Route path="/comercial/estoque-virtual" element={<EstoqueVirtual />} />
                <Route path="/canal-cpo" element={<CanalCPO />} />
                <Route path="/vendas/rastreamento" element={<RastreamentoCorreios />} />
                <Route path="/vendas/faturas-correios" element={<FaturasCorreios />} />
              </Route>

              {/* ═══════════════════════════════════════════════
                  App Acervo — índices com tab bar (Processos | Documentação)
                  Doutrina CASA-2: AcervoLayout envolve apenas as listagens.
                  Detalhes e editores ficam direto no CasaLayout (sem tab bar).
                  ═══════════════════════════════════════════════ */}
              <Route element={<AcervoLayout />}>
                <Route path="/processos" element={<Processos />} />
                <Route path="/documentacao" element={<DocumentacaoGeral />} />
              </Route>

              {/* Acervo — detalhes e editores (sem tab bar) */}
              <Route path="/processos/importar" element={
                <ProtectedRoute allowedRoles={["super_admin", "admin_rh"]}>
                  <ImportarProcessoPdf />
                </ProtectedRoute>
              } />
              <Route path="/processos/:id" element={<ProcessoDetalhe />} />
              <Route path="/processos/:id/editar" element={<ProcessoEditor />} />
              <Route path="/templates" element={<Navigate to="/processos" replace />} />
              <Route path="/templates/*" element={<Navigate to="/processos" replace />} />
              <Route path="/documentacao/novo" element={<DocumentacaoForm />} />
              <Route path="/documentacao/:slug" element={<DocumentacaoDetalhe />} />



              {/* SNCF — Portal + transversais — App Simples, CasaLayout direto */}
              {/* Doutrina CASA-2: SNCFLayout removido — rotas ficam direto no CasaLayout */}
              <Route path="/sncf" element={<PortalSNCF />} />
              <Route path="/tarefas" element={<MinhasTarefas />} />
              <Route path="/tarefas/time" element={<TarefasDoTime />} />
              <Route path="/gerenciar-usuarios" element={<Navigate to="/admin/usuarios" replace />} />
              <Route path="/gerenciar-usuarios/perfis" element={<Navigate to="/admin/usuarios/perfis" replace />} />
              <Route path="/fala-fetely" element={<FalaFetely />} />
              <Route path="/fala-fetely/conhecimento" element={<FalaFetelyConhecimento />} />
              <Route path="/fala-fetely/memorias" element={<MinhasMemorias />} />
              <Route path="/meus-dados" element={<MeusDados />} />
              <Route path="/meus-acessos" element={<MeusAcessos />} />
              <Route path="/minhas-notas" element={<MinhasNotas />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/compras/a-comprar" element={<ComprasAComprar />} />

              {/* ═══════════════════════════════════════════════
                  Layouts abaixo: dentro do CasaLayout → cobertos pelo RotaGate
                  ═══════════════════════════════════════════════ */}
              {/* TI Fetely */}
              <Route path="/ti" element={<TILayout />}>
                <Route index element={<TIDashboard />} />
                <Route path="ativos" element={<TIAtivos />} />
                <Route path="diagnosticos/teste-email" element={<TesteEmailTemplate />} />
                {/* Redirects legados — documentação migrou pra SNCF */}
                <Route path="documentacao" element={<Navigate to="/documentacao" replace />} />
                <Route path="documentacao/novo" element={<Navigate to="/documentacao/novo" replace />} />
                <Route path="documentacao/:slug" element={<TiDocSlugRedirect />} />
              </Route>

              {/* Protected routes */}
              <Route element={<AppLayout />}>
                {/* /dashboard, /gestao-a-vista, /relatorios MIGRADOS pra GestaoVistaLayout (Sprint 2 — 29/04/2026) */}
                <Route path="/desligamento/:id" element={<DesligamentoDetalhe />} />
                <Route path="/pessoas" element={<Pessoas />} />
                <Route path="/pessoas/novo" element={<PessoaForm />} />
                <Route path="/pessoas/:id/editar" element={<PessoaForm />} />
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
                  <ProtectedRoute permModule="usuarios"><Configuracoes /></ProtectedRoute>
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
                <Route path="visibilidade" element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <GerenciarVisibilidade />
                  </ProtectedRoute>
                } />
              </Route>


              {/* ═══════════════════════════════════════════════
                  Pilar Administrativo (Financeiro, Contratos, Imóveis, Seguros, GED)
                  Acesso restrito a super_admin (Fase 1)
                  ═══════════════════════════════════════════════ */}
              <Route path="/administrativo" element={<FinancasLayout />}>
                <Route index element={<DashboardFinanceiro />} />
                <Route path="plano-contas" element={<PlanoDeContas />} />
                <Route path="investimento-lancamento" element={<InvestimentoLancamento />} />

                <Route path="fluxo-caixa" element={<FluxoCaixa />} />
                <Route path="contas-pagar" element={<ContasPagar />} />
                <Route path="caixa-banco" element={<CaixaBanco />} />
                <Route path="banco-safra" element={<BancoSafra />} />
                <Route path="caixa-banco/contas" element={<ContasBancarias />} />
                <Route path="conciliacao" element={<Conciliacao />} />
                <Route path="regras-ofx" element={<RegrasOFX />} />
                <Route path="contas-receber" element={<ContasReceber />} />
                <Route path="painel-financeiro-conta" element={<PainelFinanceiroConta />} />
                <Route path="recebimentos-conciliar" element={<RecebimentosConciliar />} />
                <Route path="extrato-importacao" element={<ExtratoImportacao />} />
                <Route path="extrato-inbox" element={<ExtratoInbox />} />
                <Route path="extrato-regras" element={<RegrasInbox />} />
                <Route path="extrato-pares" element={<ParesTransferencia />} />

                <Route path="parceiros" element={<Navigate to="/administrativo-fetely/parceiros" replace />} />
                <Route path="importar" element={<Navigate to="/administrativo-fetely/importar" replace />} />
                <Route path="nfs-stage" element={<Navigate to="/administrativo-fetely/nfs-stage" replace />} />
                <Route path="documentos-pendentes" element={<Navigate to="/administrativo-fetely/documentos-pendentes" replace />} />
                <Route path="faturas-cartao" element={<FaturasCartao />} />
                
                <Route path="fluxo-futuro" element={<FluxoCaixaFuturo />} />
                <Route path="previsao-recebimentos" element={<PrevisaoRecebimentos />} />
                <Route path="fluxo-futuro-investimento" element={<FluxoFuturoInvestimento />} />
                <Route path="compromissos" element={<Compromissos />} />
                <Route path="configuracao-integracao" element={<ConfiguracaoIntegracao />} />
                {/* MIGRADOS na Sprint 2 (29/04/2026) → Administrativo Fetely:
                    pedidos, produtos, contratos, imoveis, seguros, ged.
                    Redirects logo abaixo mantêm compatibilidade com URLs antigas. */}
                {/* Redirect legado — URL antiga vai pra Casa dos Pedidos (App Simples) */}
                <Route path="pedidos" element={<Navigate to="/pedidos" replace />} />
                <Route path="produtos" element={<Navigate to="/vendas/produtos" replace />} />
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
                {/* Redirect legado — URL antiga vai pra Casa dos Pedidos (App Simples) */}
                <Route path="pedidos" element={<Navigate to="/pedidos" replace />} />
                <Route path="produtos" element={<Navigate to="/vendas/produtos" replace />} />
                {/* parceiros movido para SOPsLayout */}
                <Route path="importar" element={<ImportarDados />} />
                <Route path="nfs-stage" element={<NFsStage />} />
                <Route path="documentos-pendentes" element={<DocumentosPendentes />} />
              </Route>

              {/* ═══════════════════════════════════════════════
                  GESTÃO À VISTA — Sistema novo (Sprint 2 — 29/04/2026)
                  Recebe Dashboard + Relatórios (vindos do People).
                  URLs preservadas (/dashboard, /relatorios) — só layout muda.
                  ═══════════════════════════════════════════════ */}
              <Route element={<GestaoVistaLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/gestao-a-vista" element={<GestaoAVista />} />
                <Route path="/relatorios" element={
                  <ProtectedRoute permModule="relatorios">
                    <PlaceholderPage title="Relatórios e BI" description="Relatórios gerenciais e exportação" />
                  </ProtectedRoute>
                } />
              </Route>


            </Route>
            {/* fecha wrapper CasaLayout — RotaGate cobre TI, People, Admin, Financeiro, Marca, Dashboard */}

            {/* 404 — dentro do PublicLayout pra reaproveitar a boundary de Suspense */}
            <Route element={<PublicLayout />}>
              <Route path="/rastreamento" element={<Navigate to="/vendas/rastreamento" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
