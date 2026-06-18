import { Home, Users, Wallet, Sparkles, CreditCard, HandCoins, BookOpen, Shield, Boxes, LucideIcon } from "lucide-react";

export interface CasaApp {
  /** Identificador interno */
  id: "casa" | "pessoas" | "financas" | "marca" | "credito" | "recebimento" | "comercial" | "acervo" | "mesa";
  /** Label exibido no top nav */
  label: string;
  /** Rota default ao clicar no app */
  defaultRoute: string;
  /** Prefixos de rota que ativam este App como "atual" */
  routeMatchers: string[];
  /** Ícone Lucide */
  icon: LucideIcon;
  /** permModule necessário para aparecer (null = sempre visível) */
  permModule: string | null;
  /** App só aparece no menu do avatar (Mesa restrita) */
  hiddenFromTopNav?: boolean;
  /** Visível apenas para super_admin / admin_rh */
  requireAdminRole?: boolean;
  /** Slug de tela para checagem de permissão por grupo (null = só super_admin) */
  tela_slug: string | null;
}

export const CASA_APPS: CasaApp[] = [
  {
    id: "casa",
    label: "Casa",
    defaultRoute: "/",
    routeMatchers: ["/"],
    icon: Home,
    permModule: null,
    tela_slug: "tela.home",
  },
  {
    id: "pessoas",
    label: "Pessoas",
    defaultRoute: "/pessoas",
    routeMatchers: [
      "/pessoas",
      "/colaboradores",
      "/organograma",
      "/folha-pagamento",
      "/ferias",
      "/ponto",
      "/beneficios",
      "/contratos-pj",
      "/notas-fiscais",
      "/pagamentos-pj",
      "/onboarding",
      "/recrutamento",
      "/desligamento",
      "/movimentacoes",
      "/dashboard",
      "/gestao-a-vista",
      "/relatorios",
    ],
    icon: Users,
    permModule: null,
    tela_slug: null,
  },
  {
    id: "financas",
    label: "Finanças",
    defaultRoute: "/administrativo",
    routeMatchers: ["/administrativo"],
    icon: Wallet,
    permModule: null,
    tela_slug: "tela.financeiro",
  },
  {
    id: "marca",
    label: "Marca",
    defaultRoute: "/administrativo-fetely",
    routeMatchers: ["/administrativo-fetely"],
    icon: Sparkles,
    permModule: null,
    tela_slug: "tela.admin_fetely",
  },
  {
    id: "credito",
    label: "Crédito",
    defaultRoute: "/credito",
    routeMatchers: ["/credito"],
    icon: CreditCard,
    permModule: null,
    tela_slug: "tela.credito",
  },
  {
    id: "recebimento",
    label: "SOPs",
    defaultRoute: "/pedidos",
    routeMatchers: ["/recebimento", "/pedidos", "/comercial", "/vendas", "/administrativo-fetely/parceiros"],
    icon: HandCoins,
    permModule: null,
    tela_slug: "tela.pedidos",
  },
  {
    id: "comercial",
    label: "Comercial",
    defaultRoute: "/comercial/estoque-virtual",
    routeMatchers: ["/comercial"],
    icon: Boxes,
    permModule: null,
    tela_slug: "tela.comercial",
    hiddenFromTopNav: true,
  },
  {
    id: "acervo",
    label: "Acervo",
    defaultRoute: "/processos",
    routeMatchers: [
      "/documentacao",
      "/processos",
      "/fala-fetely",
      "/sncf",
      "/tarefas",
      "/compras",
      "/meus-dados",
      "/meus-acessos",
      "/minhas-notas",
    ],
    icon: BookOpen,
    permModule: null,
    tela_slug: "tela.sncf",
  },
  {
    id: "mesa",
    label: "Mesa",
    defaultRoute: "/admin",
    routeMatchers: ["/admin", "/ti"],
    icon: Shield,
    permModule: null,
    tela_slug: null,
    hiddenFromTopNav: true,
    requireAdminRole: true,
  },
];
