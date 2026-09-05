import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RotaGate } from "@/components/RotaGate";
import { PrimeiroAcessoOverlay } from "@/components/PrimeiroAcessoOverlay";
import { PainelTarefasGlobal } from "@/components/tarefas/PainelTarefasGlobal";
import { TarefaAbertaGlobal } from "@/components/tarefas/detalhe/TarefaAbertaGlobal";

// Layouts — importados diretamente (não lazy) para evitar Suspense na raiz e soluço de navegação.
// Layouts são pequenos (~30-80L cada) e não justificam code-splitting.
import { AppLayout } from "@/components/AppLayout";
const FinancasLayout = lazy(() => import("./layouts/FinancasLayout"));
const Faturamento = lazy(() => import("@/pages/administrativo/Faturamento"));

import TILayout from "@/layouts/TILayout";
import AdminLayout from "@/layouts/AdminLayout";
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
const PessoaEntradaRapida = lazy(() => import("@/pages/PessoaEntradaRapida"));
const PanoramaAreas = lazy(() => import("@/pages/PanoramaAreas"));

const CustoPessoas = lazy(() => import("@/pages/CustoPessoas"));
const FolhaMensal = lazy(() => import("@/pages/FolhaMensal"));
const ColaboradorDetalhe = lazy(() => import("@/pages/ColaboradorDetalhe"));
const CadastroColaboradorCLTWrapper = lazy(() => import("@/components/colaborador-clt/CadastroColaboradorCLT").then(m => ({ default: m.CadastroColaboradorCLTWrapper })));
const PlaceholderPage = lazy(() => import("@/pages/PlaceholderPage"));

const Organograma = lazy(() => import("@/pages/Organograma"));
const Reembolsos = lazy(() => import("@/pages/pessoas/Reembolsos"));
const Diretoria = lazy(() => import("@/pages/pessoas/Diretoria"));
const ReembolsoSaneamento = lazy(() => import("@/pages/pessoas/ReembolsoSaneamento"));
const ReembolsoCiclos = lazy(() => import("@/pages/pessoas/ReembolsoCiclos"));
const Login = lazy(() => import("@/pages/Login"));
const RecuperarSenha = lazy(() => import("@/pages/RecuperarSenha"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const DefinirSenha = lazy(() => import("@/pages/DefinirSenha"));
const SemPermissao = lazy(() => import("@/pages/SemPermissao"));
const AguardandoAprovacao = lazy(() => import("@/pages/AguardandoAprovacao"));
const GerenciarUsuarios = lazy(() => import("@/pages/GerenciarUsuarios"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Parametros = lazy(() => import("@/pages/Parametros"));
const SlaOperacao = lazy(() => import("@/pages/parametros/SlaOperacao"));
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

const PagarPix = lazy(() => import("@/pages/publico/PagarPix"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const ConfigurarPerfis = lazy(() => import("@/pages/ConfigurarPerfis"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const OnboardingDetalhe = lazy(() => import("@/pages/OnboardingDetalhe"));
const Cargos = lazy(() => import("@/pages/Cargos"));
const CargoForm = lazy(() => import("@/pages/CargoForm"));
const CargosEnriquecimento = lazy(() => import("@/pages/CargosEnriquecimento"));


const Compras = lazy(() => import("@/pages/Compras"));
const ComprasAComprar = lazy(() => import("@/pages/ComprasAComprar"));
const ChegadaMercadoria = lazy(() => import("@/pages/logistica/ChegadaMercadoria"));
const ChegadaMercadoriaDetalhe = lazy(() => import("@/pages/logistica/ChegadaMercadoriaDetalhe"));
const TIDashboard = lazy(() => import("@/pages/ti/TIDashboard"));
const TIAtivos = lazy(() => import("@/pages/ti/TIAtivos"));
const TesteEmailTemplate = lazy(() => import("@/pages/ti/TesteEmailTemplate"));
const NavegacaoSaude = lazy(() => import("@/pages/ti/NavegacaoSaude"));
const SincronizarBling = lazy(() => import("@/pages/ti/SincronizarBling"));
const DocumentacaoDetalhe = lazy(() => import("@/pages/ti/DocumentacaoDetalhe"));
const DocumentacaoForm = lazy(() => import("@/pages/ti/DocumentacaoForm"));
const MeuEspacoLayout = lazy(() => import("@/layouts/MeuEspacoLayout"));
const GestaoLayout = lazy(() => import("@/layouts/GestaoLayout"));
const GestaoSalas = lazy(() => import("@/pages/gestao/Salas"));
const GestaoSalaDetalhe = lazy(() => import("@/pages/gestao/SalaDetalhe"));
const GestaoAta = lazy(() => import("@/pages/gestao/Ata"));
const GestaoProjetos = lazy(() => import("@/pages/gestao/ProjetosGestao"));
const GestaoDecisoes = lazy(() => import("@/pages/gestao/Decisoes"));
const GestaoRiscos = lazy(() => import("@/pages/gestao/Riscos"));
const TarefasHoje = lazy(() => import("@/pages/tarefas/TarefasHoje"));
const MinhasTarefasNovo = lazy(() => import("@/pages/tarefas/MinhasTarefasNovo"));
const ProjetosGrid = lazy(() => import("@/pages/tarefas/ProjetosGrid"));
const ProjetoDetalhe = lazy(() => import("@/pages/tarefas/ProjetoDetalhe"));
const CalendarioTarefas = lazy(() => import("@/pages/tarefas/CalendarioTarefas"));
const CargaTrabalho = lazy(() => import("@/pages/tarefas/CargaTrabalho"));
const MeuTime = lazy(() => import("@/pages/tarefas/MeuTime"));
const RecorrenciasTarefas = lazy(() => import("@/pages/tarefas/Recorrencias"));
const TemplatesTarefas = lazy(() => import("@/pages/tarefas/Templates"));
const NotificacoesPreferencias = lazy(() => import("@/pages/tarefas/NotificacoesPreferencias"));
const FilaProcessos = lazy(() => import("@/pages/tarefas/FilaProcessos"));

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
const MeuCadastro = lazy(() => import("@/pages/MeuCadastro"));
const MinhasNotas = lazy(() => import("@/pages/MinhasNotas"));
const MinhasNotificacoes = lazy(() => import("@/pages/MinhasNotificacoes"));
const SistemaReportes = lazy(() => import("@/pages/admin/SistemaReportes"));
const HistoricoImportacoesPDF = lazy(() => import("@/pages/admin/HistoricoImportacoesPDF"));
const GerenciarVisibilidade = lazy(() => import("@/pages/admin/GerenciarVisibilidade"));
const MesaDeclaracoes = lazy(() => import("@/pages/admin/MesaDeclaracoes"));
const AtribuicoesCarga = lazy(() => import("@/pages/admin/AtribuicoesCarga"));
const NomesBling = lazy(() => import("@/pages/acervo/NomesBling"));
const GestaoAVista = lazy(() => import("@/pages/GestaoAVista"));
const DocumentacaoGeral = lazy(() => import("@/pages/DocumentacaoGeral"));
const PlanoDeContas = lazy(() => import("@/pages/administrativo/PlanoDeContas"));
const FluxoCaixa = lazy(() => import("@/pages/administrativo/FluxoCaixa"));
const ContasPagar = lazy(() => import("@/pages/administrativo/ContasPagar"));
const ContasReceber = lazy(() => import("@/pages/administrativo/ContasReceber"));
const RecebimentosConciliar = lazy(() => import("@/pages/administrativo/RecebimentosConciliar"));

const Parceiros = lazy(() => import("@/pages/administrativo/Parceiros"));
const ImportarDados = lazy(() => import("@/pages/administrativo/ImportarDados"));
const NFsStage = lazy(() => import("@/pages/administrativo/NFsStage"));
const DevolucoesFiscais = lazy(() => import("@/pages/administrativo/DevolucoesFiscais"));
const MotorClassificacao = lazy(() => import("@/pages/administrativo/MotorClassificacao"));
const FaturasCartao = lazy(() => import("@/pages/administrativo/FaturasCartao"));

// DESMONTE-PROJECOES (23/08/2026): FluxoCaixaFuturo, FluxoFuturoInvestimento e
// InvestimentoLancamento removidos — absorvidos pela classificação de despesa.
const PrevisaoRecebimentos = lazy(() => import("@/pages/administrativo/PrevisaoRecebimentos"));
// Compromissos removido — DESMONTE-CONTRATOS-RECORRENTES (23/08/2026):
// gestão de títulos vive na Cobrança.
const DocumentosPendentes = lazy(() => import("@/pages/administrativo/DocumentosPendentes"));
const AdminContratos = lazy(() => import("@/pages/administrativo/Contratos"));
const AdminGED = lazy(() => import("@/pages/administrativo/GED"));
const ConfiguracaoIntegracao = lazy(() => import("@/pages/administrativo/ConfiguracaoIntegracao"));
const BlingCallback = lazy(() => import("@/pages/administrativo/BlingCallback"));

const Produtos = lazy(() => import("@/pages/administrativo/Produtos"));
const CaixaBanco = lazy(() => import("@/pages/administrativo/CaixaBanco"));
const BancoSafra = lazy(() => import("@/pages/administrativo/BancoSafra"));
const ConciliacaoMesa = lazy(() => import("@/pages/administrativo/ConciliacaoMesa"));
const ContasBancarias = lazy(() => import("@/pages/administrativo/ContasBancarias"));
const ExtratoConta = lazy(() => import("@/pages/administrativo/ExtratoConta"));
const Conciliacao = lazy(() => import("@/pages/administrativo/Conciliacao"));
const RegrasOFX = lazy(() => import("@/pages/administrativo/RegrasOFX"));
const DashboardFinanceiro = lazy(() => import("@/pages/administrativo/DashboardFinanceiro"));
const ExtratoImportacao = lazy(() => import("@/pages/administrativo/ExtratoImportacao"));
const ExtratoInbox = lazy(() => import("@/pages/administrativo/ExtratoInbox"));
const RegrasInbox = lazy(() => import("@/pages/administrativo/RegrasInbox"));
const ParesTransferencia = lazy(() => import("@/pages/administrativo/ParesTransferencia"));
const ConciliacaoCartao = lazy(() => import("@/pages/administrativo/ConciliacaoCartao"));
const ConciliacaoDespesas = lazy(() => import("@/pages/administrativo/ConciliacaoDespesas"));
const Despesas = lazy(() => import("@/pages/administrativo/Despesas"));
const FechamentoContabil = lazy(() => import("@/pages/administrativo/contabilidade/FechamentoContabil"));
const PacoteContador = lazy(() => import("@/pages/administrativo/contabilidade/PacoteContador"));

const Auditoria = lazy(() => import("@/pages/administrativo/Auditoria"));
const PainelMargem = lazy(() => import("@/pages/administrativo/PainelMargem"));
const FluxoCompetencia = lazy(() => import("@/pages/administrativo/FluxoCompetencia"));
const AnaliseDespesas = lazy(() => import("@/pages/administrativo/AnaliseDespesas"));
const Dre = lazy(() => import("@/pages/administrativo/Dre"));

const CreditoIndex = lazy(() => import("@/pages/Credito/CreditoIndex"));
const AnaliseDetalhe = lazy(() => import("@/pages/Credito/AnaliseDetalhe"));
const ClienteDetalhe = lazy(() => import("@/pages/Credito/ClienteDetalhe"));
const CreditoClientesIndex = lazy(() => import("@/pages/Credito/CreditoClientesIndex"));
const CobrancaFila = lazy(() => import("@/pages/Credito/CobrancaFila"));
const MesaCobranca = lazy(() => import("@/pages/Credito/MesaCobranca"));
const CobrancaDetalhe = lazy(() => import("@/pages/Credito/CobrancaDetalhe"));
const RecebimentoLayout = lazy(() => import("@/pages/Recebimento/RecebimentoLayout"));

const RegrasCadencia = lazy(() => import("@/pages/Credito/RegrasCadencia"));
const ReguaEtapas = lazy(() => import("@/pages/Credito/ReguaEtapas"));

const PedidosIndex = lazy(() => import("@/pages/Pedidos/PedidosIndex"));
const PedidoDetalhe = lazy(() => import("@/pages/Pedidos/PedidoDetalhe"));
const ParceiroDetalhe = lazy(() => import("@/pages/Parceiros/ParceiroDetalhe"));
const ClientePainel = lazy(() => import("@/pages/clientes/ClientePainel"));
const ClientesLista = lazy(() => import("@/pages/clientes/ClientesLista"));
const EstoqueVirtual = lazy(() => import("@/pages/Comercial/EstoqueVirtual"));
const ConsignadoDetalhe = lazy(() => import("@/pages/Comercial/ConsignadoDetalhe"));

const XpmIndex = lazy(() => import("@/pages/vendas/xpm/XpmIndex"));
const SaudeEstoque = lazy(() => import("@/pages/acervo/SaudeEstoque"));
const EntradasEstoque = lazy(() => import("@/pages/vendas/produto/EntradasEstoque"));
const RetornoDevolucao = lazy(() => import("@/pages/estoque/RetornoDevolucao"));

const ConciliacaoCadastro = lazy(() => import("@/pages/acervo/ConciliacaoCadastro"));
const DestinosCadastro = lazy(() => import("@/pages/acervo/DestinosCadastro"));
const VendasLayout = lazy(() => import("@/layouts/VendasLayout"));
const ProdutoEstoqueLayout = lazy(() => import("@/layouts/ProdutoEstoqueLayout"));
const NfsDeVenda = lazy(() => import("@/pages/Vendas/NfsDeVenda"));


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

// MUNDO MORTO: este wizard gravava em colaboradores_clt (0 linhas), fora de pessoas/vinculos. Cadastro oficial = /pessoas/novo.
function RedirectToPessoasNovo() {
  return <Navigate to="/pessoas/novo" replace />;
}

// CHEGADA-MERCADORIA-MORA-EM-SOPS (04/09/2026): /compras/mercadoria → /logistica/chegada-mercadoria
function ChegadaMercadoriaRedirect() {
  const location = useLocation();
  return <Navigate to={"/logistica/chegada-mercadoria" + location.search} replace />;
}
function ChegadaMercadoriaIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/logistica/chegada-mercadoria/${id}`} replace />;
}

// Redirects para rotas legadas migradas para /admin
function CargosIdRedirect() {
  const { id } = useParams();
  // CARGOS-MORA-EM-PESSOAS (23/08/2026): rota oficial é /pessoas/cargos/:id
  return <Navigate to={`/pessoas/cargos/${id}`} replace />;
}

// GESTAO-E-ABA-DE-TAREFAS (21/08/2026): rotas legadas /gestao/* → /tarefas/gestao/*
function GestaoSalaRedirect() {
  const { salaId } = useParams();
  return <Navigate to={`/tarefas/gestao/sala/${salaId}`} replace />;
}
function GestaoAtaRedirect() {
  const { reuniaoId } = useParams();
  return <Navigate to={`/tarefas/gestao/ata/${reuniaoId}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PrimeiroAcessoOverlay />
          <PainelTarefasGlobal />
          <TarefaAbertaGlobal />
          <Routes>
            {/* Public routes (Suspense boundary via PublicLayout — R-01) */}
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/recuperar-senha" element={<RecuperarSenha />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/definir-senha" element={<DefinirSenha />} />
              <Route path="/sem-permissao" element={<SemPermissao />} />
              <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
              
              <Route path="/pagar/:token" element={<PagarPix />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
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
              </Route>
              <Route path="/recebimento/cobranca/:pedidoId" element={<CobrancaDetalhe />} />
              <Route path="/credito/regras-cadencia" element={<RegrasCadencia />} />
              <Route path="/credito/regua-etapas" element={<ReguaEtapas />} />


              {/* Detail routes (sem sidebar) */}
              <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
              <Route path="/parceiros/:id" element={<ParceiroDetalhe />} />
              <Route path="/cliente/:id" element={<ClientePainel />} />

              {/* ═══════════════════════════════════════════════
                  App SOPs — com sidebar lateral
                  Absorve: Pedidos, Cobrança, NFs, Parceiros, Estoque Virtual
                  ═══════════════════════════════════════════════ */}
              <Route element={<VendasLayout />}>
                <Route path="/pedidos" element={<PedidosIndex />} />
                {/* /cliente = lista (porta); /cliente/:id = detalhe */}
                <Route path="/cliente" element={<ClientesLista />} />
                <Route path="/recebimento/cobranca" element={<CobrancaFila />} />

                <Route path="/vendas/nfs" element={<NfsDeVenda />} />
                <Route path="/vendas/bling-pedidos" element={<PedidosVenda />} />
                
                <Route path="/vendas/produto" element={<Produtos />} />
                <Route element={<ProdutoEstoqueLayout />}>
                  
                  <Route path="/vendas/produto/estoque/virtual" element={<EstoqueVirtual />} />
                  <Route path="/vendas/produto/estoque/saude" element={<SaudeEstoque />} />
                  <Route path="/vendas/produto/estoque/entradas" element={<EntradasEstoque />} />
                  <Route path="/vendas/produto/estoque/conciliacao" element={<ConciliacaoCadastro />} />
                  <Route path="/vendas/produto/estoque/nomes-bling" element={
                    <ProtectedRoute>
                      <NomesBling />
                    </ProtectedRoute>
                  } />
                  <Route path="/vendas/produto/estoque/destinos" element={<DestinosCadastro />} />

                </Route>
                <Route path="/vendas/xpm" element={<XpmIndex />} />
                <Route path="/vendas/gestao-pedidos" element={<GestaoPedidos />} />
                
                <Route path="/vendas/shopify" element={<ShopifyB2c />} />
                <Route path="/vendas/shopify/checkouts" element={<ShopifyCheckouts />} />
                <Route path="/vendas/shopify/produtos" element={<ShopifyProdutos />} />
                <Route path="/vendas/shopify/clientes" element={<ShopifyClientes />} />
                <Route path="/vendas/shopify/reembolsos" element={<ShopifyReembolsos />} />
                <Route path="/vendas/shopify/fulfillments" element={<ShopifyFulfillments />} />
                <Route path="/vendas/shopify/estoque" element={<ShopifyEstoque />} />
                <Route path="/logistica" element={<Logistica />} />
                <Route path="/logistica/chegada-mercadoria" element={<ChegadaMercadoria />} />
                <Route path="/logistica/chegada-mercadoria/:id" element={<ChegadaMercadoriaDetalhe />} />
                
                <Route path="/administrativo-fetely/parceiros" element={<Parceiros />} />

                <Route path="/canal-cpo" element={<CanalCPO />} />
                <Route path="/devolucoes" element={<RetornoDevolucao />} />
              </Route>

              <Route path="/comercial/consignados/:parceiroId" element={<ConsignadoDetalhe />} />




              {/* ═══════════════════════════════════════════════
                  App Acervo — sidebar lateral (23/08/2026, MENU-VIA-TABELA).
                  Antes era tab bar só com Processos | Documentação; a sidebar
                  vem da sncf_navegacao (Conhecimento, Fala Fetely).
                  Doutrina CASA-2: AcervoLayout envolve apenas as listagens.
                  Detalhes e editores ficam direto no CasaLayout (sem sidebar).
                  ═══════════════════════════════════════════════ */}
              <Route element={<AcervoLayout />}>
                <Route path="/processos" element={<Processos />} />
                <Route path="/documentacao" element={<DocumentacaoGeral />} />
                <Route path="/fala-fetely" element={<FalaFetely />} />
                <Route path="/fala-fetely/conhecimento" element={<FalaFetelyConhecimento />} />
              </Route>

              {/* Acervo — detalhes e editores (sem tab bar) */}
              <Route path="/processos/importar" element={
                <ProtectedRoute>
                  <ImportarProcessoPdf />
                </ProtectedRoute>
              } />
              <Route path="/processos/:id" element={<ProcessoDetalhe />} />
              <Route path="/processos/:id/editar" element={<ProcessoEditor />} />
              <Route path="/documentacao/novo" element={<DocumentacaoForm />} />
              <Route path="/documentacao/:slug" element={<DocumentacaoDetalhe />} />



              {/* SNCF — Portal SNCF movido para dentro do AcervoLayout (23/08/2026) */}
              <Route path="/tarefas" element={<Navigate to="/tarefas/hoje" replace />} />
              <Route element={<MeuEspacoLayout />}>
                <Route path="/tarefas/hoje" element={<TarefasHoje />} />
                <Route path="/tarefas/minhas" element={<MinhasTarefasNovo />} />
                <Route path="/tarefas/projetos" element={<ProjetosGrid />} />
                <Route path="/tarefas/projetos/:id" element={<ProjetoDetalhe />} />
                <Route path="/tarefas/calendario" element={<CalendarioTarefas />} />
                <Route path="/tarefas/carga" element={<CargaTrabalho />} />
                <Route path="/tarefas/time" element={<MeuTime />} />
                <Route path="/tarefas/recorrencias" element={<RecorrenciasTarefas />} />
                <Route path="/tarefas/templates" element={<TemplatesTarefas />} />
                <Route path="/tarefas/notificacoes" element={<NotificacoesPreferencias />} />
                <Route path="/tarefas/fila" element={<FilaProcessos />} />
                <Route element={<GestaoLayout />}>
                  <Route path="/tarefas/gestao" element={<GestaoSalas />} />
                  <Route path="/tarefas/gestao/sala/:salaId" element={<GestaoSalaDetalhe />} />
                  <Route path="/tarefas/gestao/ata/:reuniaoId" element={<GestaoAta />} />
                  <Route path="/tarefas/gestao/projetos" element={<GestaoProjetos />} />
                  <Route path="/tarefas/gestao/decisoes" element={<GestaoDecisoes />} />
                  <Route path="/tarefas/gestao/riscos" element={<GestaoRiscos />} />
                </Route>
                <Route path="/fala-fetely/memorias" element={<MinhasMemorias />} />
                <Route path="/meus-dados" element={<MeusDados />} />
                <Route path="/meus-acessos" element={<MeusAcessos />} />
                <Route path="/meu-cadastro" element={<MeuCadastro />} />
                <Route path="/minhas-notas" element={<MinhasNotas />} />
                <Route path="/minhas-notificacoes" element={<MinhasNotificacoes />} />
              </Route>

              <Route element={<FinancasLayout />}>
                <Route path="/compras" element={<Compras />} />
                <Route path="/compras/a-comprar" element={<ComprasAComprar />} />
              </Route>


              {/* ═══════════════════════════════════════════════
                  Layouts abaixo: dentro do CasaLayout → cobertos pelo RotaGate
                  ═══════════════════════════════════════════════ */}
              {/* TI Fetely */}
              <Route path="/ti" element={<TILayout />}>
                <Route index element={<TIDashboard />} />
                <Route path="ativos" element={<TIAtivos />} />
                <Route path="navegacao-saude" element={<NavegacaoSaude />} />
                <Route path="reportes" element={
                  <ProtectedRoute><SistemaReportes /></ProtectedRoute>
                } />
                <Route path="integracoes" element={
                  <ProtectedRoute><ConfiguracaoIntegracao /></ProtectedRoute>
                } />
                <Route path="sincronizar-bling" element={
                  <ProtectedRoute><SincronizarBling /></ProtectedRoute>
                } />
                {/* GED moveu para TI (DESMONTE-PATRIMONIO, 23/08/2026): governança de arquivo é infra */}
                <Route path="ged" element={
                  <ProtectedRoute><AdminGED /></ProtectedRoute>
                } />
                <Route path="diagnosticos/teste-email" element={<TesteEmailTemplate />} />
                
              </Route>

              {/* Protected routes */}
              <Route element={<AppLayout />}>
                {/* /dashboard, /gestao-a-vista, /relatorios MIGRADOS pra GestaoVistaLayout (Sprint 2 — 29/04/2026) */}
                <Route path="/desligamento/:id" element={<DesligamentoDetalhe />} />
                <Route path="/pessoas" element={<Pessoas />} />
                <Route path="/pessoas/panorama" element={<PanoramaAreas />} />
                
                <Route path="/pessoas/custo" element={<CustoPessoas />} />
                <Route path="/pessoas/folha" element={<FolhaMensal />} />
                <Route path="/pessoas/organograma" element={<Organograma />} />
                {/* CARGOS-MORA-EM-PESSOAS (23/08/2026): saiu de /admin/* para o pilar certo */}
                <Route path="/pessoas/cargos" element={
                  <ProtectedRoute><Cargos /></ProtectedRoute>
                } />
                <Route path="/pessoas/cargos/novo" element={
                  <ProtectedRoute><CargoForm /></ProtectedRoute>
                } />
                <Route path="/pessoas/cargos/enriquecimento" element={
                  <ProtectedRoute><CargosEnriquecimento /></ProtectedRoute>
                } />
                <Route path="/pessoas/cargos/:id" element={
                  <ProtectedRoute><CargoForm /></ProtectedRoute>
                } />
                <Route path="/pessoas/diretoria" element={<Diretoria />} />
                <Route path="/pessoas/reembolsos" element={<Reembolsos />} />
                <Route
                  path="/pessoas/reembolsos/saneamento"
                  element={
                    <ProtectedRoute>
                      <ReembolsoSaneamento />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pessoas/reembolsos/ciclos"
                  element={
                    <ProtectedRoute>
                      <ReembolsoCiclos />
                    </ProtectedRoute>
                  }
                />
                <Route path="/pessoas/novo" element={<PessoaEntradaRapida />} />
                <Route path="/pessoas/:id/editar" element={<PessoaForm />} />
                <Route path="/colaboradores" element={
                  <ProtectedRoute>
                    <RedirectToPessoasCLT />
                  </ProtectedRoute>
                } />
                {/* MUNDO MORTO: este wizard gravava em colaboradores_clt (0 linhas), fora de pessoas/vinculos. Cadastro oficial = /pessoas/novo. */}
                <Route path="/colaboradores/novo" element={
                  <ProtectedRoute>
                    <RedirectToPessoasNovo />
                  </ProtectedRoute>
                } />
                <Route path="/colaboradores/:id" element={
                  <ProtectedRoute>
                    <ColaboradorDetalhe />
                  </ProtectedRoute>
                } />
                <Route path="/organograma" element={
                  <ProtectedRoute>
                    <Organograma />
                  </ProtectedRoute>
                } />
                <Route path="/movimentacoes" element={
                  <ProtectedRoute>
                    <Movimentacoes />
                  </ProtectedRoute>
                } />

                {/* CLT */}
                <Route path="/folha-pagamento" element={
                  <ProtectedRoute>
                    <FolhaPagamento />
                  </ProtectedRoute>
                } />
                <Route path="/ferias" element={
                  <ProtectedRoute>
                    <Ferias />
                  </ProtectedRoute>
                } />
                <Route path="/ferias/colaborador/:id" element={
                  <ProtectedRoute>
                    <FeriasColaborador />
                  </ProtectedRoute>
                } />
                <Route path="/ponto" element={
                  <ProtectedRoute>
                    <PlaceholderPage title="Controle de Ponto" description="Apuração de horas e banco de horas" />
                  </ProtectedRoute>
                } />
                <Route path="/beneficios" element={
                  <ProtectedRoute>
                    <Beneficios />
                  </ProtectedRoute>
                } />

                {/* PJ */}
                <Route path="/contratos-pj" element={
                  <ProtectedRoute>
                    <RedirectToPessoasPJ />
                  </ProtectedRoute>
                } />
                {/* MUNDO MORTO: este wizard gravava em contratos_pj sem pessoa/vinculo ativo. Cadastro oficial = /pessoas/novo. */}
                <Route path="/contratos-pj/novo" element={
                  <ProtectedRoute>
                    <RedirectToPessoasNovo />
                  </ProtectedRoute>
                } />
                <Route path="/contratos-pj/novo-manual" element={
                  <ProtectedRoute>
                    <CadastroManualContratoPJ />
                  </ProtectedRoute>
                } />
                <Route path="/contratos-pj/:id" element={
                  <ProtectedRoute>
                    <ContratoPJDetalhe />
                  </ProtectedRoute>
                } />
                <Route path="/notas-fiscais" element={
                  <ProtectedRoute>
                    <NotasFiscais />
                  </ProtectedRoute>
                } />
                <Route path="/notas-fiscais/:id" element={
                  <ProtectedRoute>
                    <NotaFiscalDetalhe />
                  </ProtectedRoute>
                } />
                <Route path="/pagamentos-pj" element={
                  <ProtectedRoute>
                    <PagamentosPJ />
                  </ProtectedRoute>
                } />
                <Route path="/pagamentos-pj/:contratoId" element={
                  <ProtectedRoute>
                    <PagamentoPJRelatorio />
                  </ProtectedRoute>
                } />

                {/* RH */}
                <Route path="/onboarding" element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                } />
                <Route path="/onboarding/:id" element={
                  <ProtectedRoute>
                    <OnboardingDetalhe />
                  </ProtectedRoute>
                } />
                <Route path="/avaliacoes" element={
                  <ProtectedRoute>
                    <PlaceholderPage title="Avaliações de Desempenho" description="Ciclos de avaliação e PDI" />
                  </ProtectedRoute>
                } />
                <Route path="/treinamentos" element={
                  <ProtectedRoute>
                    <PlaceholderPage title="Treinamentos" description="Controle de capacitação e certificados" />
                  </ProtectedRoute>
                } />
                {/* /relatorios MIGRADO pra GestaoVistaLayout (Sprint 2 — 29/04/2026) */}

                </Route>

              {/* ═══════════════════════════════════════════════
                  Administração (zona restrita: super_admin + admin_rh)
                  ═══════════════════════════════════════════════ */}
              <Route path="/admin" element={<AdminLayout />}>
                {/* Cargos migrou para /pessoas/cargos (CARGOS-MORA-EM-PESSOAS, 23/08/2026) */}
                <Route index element={<Navigate to="/admin/usuarios" replace />} />
                <Route path="parametros" element={
                  <ProtectedRoute><Parametros /></ProtectedRoute>
                } />
                <Route path="configuracoes" element={<Navigate to="/admin" replace />} />
                <Route path="usuarios" element={
                  <ProtectedRoute><GerenciarUsuarios /></ProtectedRoute>
                } />
                <Route path="usuarios/perfis" element={
                  <ProtectedRoute><ConfigurarPerfis /></ProtectedRoute>
                } />
                {/* Reportes migrou para /ti/reportes (REPORTES-E-DE-TI, 23/08/2026) */}
                <Route path="importacoes-pdf" element={
                  <ProtectedRoute>
                    <HistoricoImportacoesPDF />
                  </ProtectedRoute>
                } />
                <Route path="visibilidade" element={
                  <ProtectedRoute>
                    <GerenciarVisibilidade />
                  </ProtectedRoute>
                } />
                <Route path="declaracoes" element={
                  <ProtectedRoute>
                    <MesaDeclaracoes />
                  </ProtectedRoute>
                } />
                <Route path="atribuicoes" element={
                  <ProtectedRoute>
                    <AtribuicoesCarga />
                  </ProtectedRoute>
                } />
                <Route path="sla" element={
                  <ProtectedRoute><SlaOperacao /></ProtectedRoute>
                } />
                <Route path="sla-xpm" element={<Navigate to="/admin/sla" replace />} />


              </Route>


              {/* ═══════════════════════════════════════════════
                  Pilar Administrativo (Financeiro, Contratos, Imóveis, Seguros, GED)
                  Acesso restrito a super_admin (Fase 1)
                  ═══════════════════════════════════════════════ */}
              <Route path="/administrativo" element={<FinancasLayout />}>
                <Route index element={<DashboardFinanceiro />} />
                <Route path="analise-despesas" element={<AnaliseDespesas />} />
                <Route path="plano-contas" element={<PlanoDeContas />} />

                <Route path="fluxo-caixa" element={<FluxoCaixa />} />
                <Route path="contas-pagar" element={<ContasPagar />} />
                <Route path="caixa-banco" element={<CaixaBanco />} />
                <Route path="banco-safra" element={<BancoSafra />} />
                <Route path="conciliacao-mesa" element={<ConciliacaoMesa />} />
                <Route path="caixa-banco/contas" element={<ContasBancarias />} />
                <Route path="caixa-banco/contas/:contaId" element={<ExtratoConta />} />
                <Route path="conciliacao" element={<Conciliacao />} />
                <Route path="regras-ofx" element={<RegrasOFX />} />
                <Route path="contas-receber" element={<ContasReceber />} />
                
                <Route path="recebimentos-conciliar" element={<RecebimentosConciliar />} />
                <Route path="extrato-importacao" element={<ExtratoImportacao />} />
                <Route path="extrato-inbox" element={<ExtratoInbox />} />
                <Route path="extrato-regras" element={<RegrasInbox />} />
                <Route path="extrato-pares" element={<ParesTransferencia />} />
                <Route path="conciliacao-cartao" element={<ConciliacaoCartao />} />
                <Route path="conciliacao-despesas" element={<ConciliacaoDespesas />} />
                <Route path="despesas" element={<Despesas />} />
                <Route path="contabilidade/fechamento" element={<FechamentoContabil />} />
                <Route path="contabilidade/pacote" element={<PacoteContador />} />
                
                <Route path="auditoria" element={<Auditoria />} />
                <Route path="painel-margem" element={<PainelMargem />} />
                <Route path="faturamento" element={<Faturamento />} />
                <Route path="fluxo-competencia" element={<FluxoCompetencia />} />
                <Route path="dre" element={<Dre />} />

                <Route path="faturas-cartao" element={<FaturasCartao />} />
                
                <Route path="previsao-recebimentos" element={<PrevisaoRecebimentos />} />
                {/* compromissos removido — DESMONTE-CONTRATOS-RECORRENTES (23/08/2026) */}
                {/* Integrações moveu para /ti/integracoes (23/08/2026): é infra, não financeiro */}
                {/* DESMONTE-PATRIMONIO (23/08/2026): pilar /administrativo-fetely extinto.
                    Contratos e o grupo Documentos voltam para Finanças; GED foi para /ti/ged;
                    Imóveis e Seguros nunca foram construídos. */}
                <Route path="contratos" element={<AdminContratos />} />
                <Route path="importar" element={<ImportarDados />} />
                <Route path="nfs-stage" element={<NFsStage />} />
                <Route path="devolucoes-fiscais" element={<DevolucoesFiscais />} />
                <Route path="motor-classificacao" element={<MotorClassificacao />} />
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
                  <ProtectedRoute>
                    <PlaceholderPage title="Relatórios e BI" description="Relatórios gerenciais e exportação" />
                  </ProtectedRoute>
                } />
              </Route>


            </Route>
            {/* fecha wrapper CasaLayout — RotaGate cobre TI, People, Admin, Financeiro, Marca, Dashboard */}

            {/* ═══════════════════════════════════════════════
                Redirects de compatibilidade — REDIRECT-NÃO-É-TELA
                Rota que só devolve <Navigate> não passa por portão:
                ela não exibe nada, e o destino tem o portão dele.
                NÃO adicionar tela real aqui.
                ═══════════════════════════════════════════════ */}
            {/* DESMONTE-PROJECOES (23/08/2026): absorvido pela classificação de despesa */}
            <Route path="/administrativo/fluxo-futuro" element={<Navigate to="/administrativo/fluxo-caixa" replace />} />
            <Route path="/administrativo/fluxo-futuro-investimento" element={<Navigate to="/administrativo/fluxo-caixa" replace />} />
            <Route path="/administrativo/investimento-lancamento" element={<Navigate to="/administrativo/despesas" replace />} />
            {/* DESMONTE-CONTRATOS-RECORRENTES (23/08/2026): gestão de títulos vive na Cobrança */}
            <Route path="/administrativo/compromissos" element={<Navigate to="/administrativo/contas-pagar" replace />} />
            {/* Entradas Recebidas e Aguardando Pagamento desmontados (23/08/2026):
                adiantamento vive na aba da Cobrança; estágio do pedido, na Casa dos Pedidos */}
            <Route path="/recebimento/entradas" element={<Navigate to="/recebimento/cobranca?aba=adiantamento" replace />} />
            <Route path="/recebimento/aguardando-pagamento" element={<Navigate to="/pedidos" replace />} />
            {/* Destinos de Cadastro é do SOPs, não do Acervo (23/08/2026) */}
            <Route path="/acervo/destinos-cadastro" element={<Navigate to="/vendas/produto/estoque/destinos" replace />} />
            {/* Integrações moveu para TI (23/08/2026): é infra, não financeiro */}
            <Route path="/administrativo/configuracao-integracao" element={<Navigate to="/ti/integracoes" replace />} />
            <Route path="/vendas/produtos" element={<Navigate to="/vendas/produto" replace />} />
            <Route path="/vendas/produto/estoque" element={<Navigate to="/vendas/produto/estoque/virtual" replace />} />
            <Route path="/logistica/analise-custo" element={<Navigate to="/logistica" replace />} />
            <Route path="/comercial/estoque-virtual" element={<Navigate to="/vendas/produto/estoque/virtual" replace />} />
            <Route path="/comercial" element={<Navigate to="/pedidos" replace />} />
            <Route path="/comercial/oportunidades" element={<Navigate to="/pedidos?aba=recuperacao" replace />} />
            {/* Dash de Pedidos é aba da Casa dos Pedidos (23/08/2026) */}
            <Route path="/vendas/dash-pedidos" element={<Navigate to="/pedidos?aba=dash" replace />} />
            {/* DESMONTE-FAROL-PEDIDOS (23/08/2026): função permanece no banco (sla_fase_pedido/fn_previsao_entrega); tela substituída pela Casa dos Pedidos */}
            <Route path="/vendas/farol-pedidos" element={<Navigate to="/pedidos" replace />} />
            {/* Retorno de Devolução emancipado do Estoque (23/08/2026) */}
            <Route path="/vendas/produto/estoque/devolucoes" element={<Navigate to="/devolucoes" replace />} />
            {/* Portal SNCF desmontado (23/08/2026): a Casa já faz essa função */}
            <Route path="/sncf" element={<Navigate to="/" replace />} />
            <Route path="/comercial/consignados" element={<Navigate to="/pedidos?aba=consignados" replace />} />
            <Route path="/produto" element={<Navigate to="/vendas/produto" replace />} />
            <Route path="/produto/estoque/virtual" element={<Navigate to="/vendas/produto/estoque/virtual" replace />} />
            <Route path="/produto/estoque/saude" element={<Navigate to="/vendas/produto/estoque/saude" replace />} />
            <Route path="/produto/estoque/conciliacao" element={<Navigate to="/vendas/produto/estoque/conciliacao" replace />} />
            <Route path="/acervo/estoque/recebimento-xpm" element={<Navigate to="/vendas/xpm" replace />} />
            <Route path="/acervo/estoque/saude" element={<Navigate to="/vendas/produto/estoque/saude" replace />} />
            <Route path="/acervo/produtos/conciliacao" element={<Navigate to="/vendas/produto/estoque/conciliacao" replace />} />
            <Route path="/templates" element={<Navigate to="/processos" replace />} />
            <Route path="/templates/*" element={<Navigate to="/processos" replace />} />
            <Route path="/gerenciar-usuarios" element={<Navigate to="/admin/usuarios" replace />} />
            <Route path="/gerenciar-usuarios/perfis" element={<Navigate to="/admin/usuarios/perfis" replace />} />
            <Route path="/compras/de-para-fornecedor" element={<Navigate to="/logistica/chegada-mercadoria?aba=de-para" replace />} />
            <Route path="/compras/cadastro-pedido" element={<Navigate to="/logistica/chegada-mercadoria?aba=pedidos" replace />} />
            <Route path="/compras/mercadoria" element={<ChegadaMercadoriaRedirect />} />
            <Route path="/compras/mercadoria/:id" element={<ChegadaMercadoriaIdRedirect />} />
            <Route path="/ti/documentacao" element={<Navigate to="/documentacao" replace />} />
            <Route path="/ti/documentacao/novo" element={<Navigate to="/documentacao/novo" replace />} />
            <Route path="/ti/documentacao/:slug" element={<TiDocSlugRedirect />} />
            <Route path="/parametros" element={<Navigate to="/admin/parametros" replace />} />
            <Route path="/configuracoes" element={<Navigate to="/admin" replace />} />
            <Route path="/configurar-perfis" element={<Navigate to="/admin/usuarios/perfis" replace />} />
            <Route path="/cargos" element={<Navigate to="/pessoas/cargos" replace />} />
            <Route path="/cargos/enriquecimento" element={<Navigate to="/pessoas/cargos/enriquecimento" replace />} />
            <Route path="/cargos/novo" element={<Navigate to="/pessoas/cargos/novo" replace />} />
            <Route path="/cargos/:id" element={<CargosIdRedirect />} />
            {/* CARGOS-MORA-EM-PESSOAS / REPORTES-E-DE-TI (23/08/2026): rotas antigas redirecionam */}
            <Route path="/admin/cargos" element={<Navigate to="/pessoas/cargos" replace />} />
            <Route path="/admin/cargos/novo" element={<Navigate to="/pessoas/cargos/novo" replace />} />
            <Route path="/admin/cargos/enriquecimento" element={<Navigate to="/pessoas/cargos/enriquecimento" replace />} />
            <Route path="/admin/reportes" element={<Navigate to="/ti/reportes" replace />} />
            {/* Sala de Gestão virou aba de Tarefas (GESTAO-E-ABA-DE-TAREFAS) */}
            <Route path="/gestao" element={<Navigate to="/tarefas/gestao" replace />} />
            <Route path="/gestao/projetos" element={<Navigate to="/tarefas/gestao/projetos" replace />} />
            <Route path="/gestao/decisoes" element={<Navigate to="/tarefas/gestao/decisoes" replace />} />
            <Route path="/gestao/riscos" element={<Navigate to="/tarefas/gestao/riscos" replace />} />
            <Route path="/gestao/sala/:salaId" element={<GestaoSalaRedirect />} />
            <Route path="/gestao/ata/:reuniaoId" element={<GestaoAtaRedirect />} />
            <Route path="/administrativo/parceiros" element={<Navigate to="/administrativo-fetely/parceiros" replace />} />
            <Route path="/administrativo/pedidos" element={<Navigate to="/pedidos" replace />} />
            <Route path="/administrativo/produtos" element={<Navigate to="/vendas/produto" replace />} />
            {/* DESMONTE-PATRIMONIO (23/08/2026): pilar extinto — Contratos → Finanças, GED → TI,
                Imóveis/Seguros nunca construídos. importar/nfs-stage/motor-classificacao/
                documentos-pendentes viraram rotas reais em Finanças. */}
            <Route path="/administrativo/imoveis" element={<Navigate to="/administrativo" replace />} />
            <Route path="/administrativo/seguros" element={<Navigate to="/administrativo" replace />} />
            <Route path="/administrativo/ged" element={<Navigate to="/ti/ged" replace />} />
            <Route path="/administrativo-fetely/contratos" element={<Navigate to="/administrativo/contratos" replace />} />
            <Route path="/administrativo-fetely/ged" element={<Navigate to="/ti/ged" replace />} />
            <Route path="/administrativo-fetely/imoveis" element={<Navigate to="/administrativo" replace />} />
            <Route path="/administrativo-fetely/seguros" element={<Navigate to="/administrativo" replace />} />
            <Route path="/administrativo-fetely/importar" element={<Navigate to="/administrativo/importar" replace />} />
            <Route path="/administrativo-fetely/nfs-stage" element={<Navigate to="/administrativo/nfs-stage" replace />} />
            <Route path="/administrativo-fetely/motor-classificacao" element={<Navigate to="/administrativo/motor-classificacao" replace />} />
            <Route path="/administrativo-fetely/documentos-pendentes" element={<Navigate to="/administrativo/documentos-pendentes" replace />} />
            <Route path="/administrativo-fetely/pedidos" element={<Navigate to="/pedidos" replace />} />
            <Route path="/administrativo-fetely/produtos" element={<Navigate to="/vendas/produto" replace />} />
            <Route path="/administrativo-fetely" element={<Navigate to="/administrativo" replace />} />

            {/* 404 — dentro do PublicLayout pra reaproveitar a boundary de Suspense */}
            <Route element={<PublicLayout />}>
              <Route path="/rastreamento" element={<Navigate to="/logistica" replace />} />
              <Route path="/teste-frete" element={<Navigate to="/ti" replace />} />
              <Route path="/teste-rastreio" element={<Navigate to="/ti" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
