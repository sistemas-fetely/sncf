import { Home, Users, Wallet, Sparkles, CreditCard, HandCoins, BookOpen, Shield, LucideIcon } from "lucide-react";

export interface CasaApp {
  /** Identificador interno */
  id: "casa" | "pessoas" | "financas" | "marca" | "credito" | "recebimento" | "acervo" | "mesa";
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
}

export const CASA_APPS: CasaApp[] = [
  {
    id: "casa",
    label: "Casa",
    defaultRoute: "/",
    routeMatchers: ["/"],
    icon: Home,
    permModule: null,
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
  },
  {
    id: "financas",
    label: "Finanças",
    defaultRoute: "/administrativo",
    routeMatchers: ["/administrativo"],
    icon: Wallet,
    permModule: null,
  },
  {
    id: "marca",
    label: "Marca",
    defaultRoute: "/administrativo-fetely",
    routeMatchers: ["/administrativo-fetely"],
    icon: Sparkles,
    permModule: null,
  },
  {
    id: "credito",
    label: "Crédito",
    defaultRoute: "/credito",
    routeMatchers: ["/credito"],
    icon: CreditCard,
    permModule: null,
  },
  {
    id: "recebimento",
    label: "Vendas",
    defaultRoute: "/recebimento",
    routeMatchers: ["/recebimento", "/pedidos"],
    icon: HandCoins,
    permModule: null,
  },
  {
    id: "acervo",
    label: "Acervo",
    defaultRoute: "/documentacao",
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
  },
  {
    id: "mesa",
    label: "Mesa",
    defaultRoute: "/admin",
    routeMatchers: ["/admin", "/ti"],
    icon: Shield,
    permModule: null,
    hiddenFromTopNav: true,
    requireAdminRole: true,
  },
];
