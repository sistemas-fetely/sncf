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
  /** App só aparece no menu do avatar (Mesa restrita) */
  hiddenFromTopNav?: boolean;
  /** Visível apenas para super_admin / admin_rh */
  requireAdminRole?: boolean;
  /** Slug de tela para checagem de permissão por grupo (null = só super_admin) */
  tela_slug: string | null;
  /** Prefixo de sub-slugs granulares: o app aparece se o usuário tiver
   *  qualquer permissão com este prefixo (ex: "tela.fin_" para Finanças
   *  recortada por tela), mesmo sem o slug-mãe. */
  slugPrefix?: string;
  /** Apps da sncf_navegacao que compoem este app da Casa. Usado para resolver
   *  o destino da aba quando o defaultRoute nao esta visivel para o usuario. */
  appChaves?: string[];
}

export const CASA_APPS: CasaApp[] = [
  {
    id: "casa",
    label: "Casa",
    defaultRoute: "/",
    routeMatchers: ["/"],
    icon: Home,
    tela_slug: "tela.home",
    appChaves: ["casa"],
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
      "/convites-cadastro",
      "/avaliacoes",
      "/treinamentos",
    ],
    icon: Users,
    tela_slug: "tela.pessoas",
    slugPrefix: "tela.pessoas_",
    appChaves: ["pessoas"],
  },
  {
    id: "financas",
    label: "Finanças",
    defaultRoute: "/administrativo",
    routeMatchers: ["/administrativo", "/compras"],
    icon: Wallet,
    tela_slug: "tela.financeiro",
    slugPrefix: "tela.fin_",
    appChaves: ["financas"],
  },
  {
    id: "marca",
    label: "Marca",
    defaultRoute: "/administrativo-fetely",
    routeMatchers: ["/administrativo-fetely"],
    icon: Sparkles,
    tela_slug: "tela.admin_fetely",
    appChaves: ["patrimonio"],
  },
  {
    id: "credito",
    label: "Crédito",
    defaultRoute: "/credito",
    routeMatchers: ["/credito"],
    icon: CreditCard,
    tela_slug: "tela.credito",
    appChaves: ["credito"],
  },
  {
    id: "recebimento",
    label: "SOPs",
    defaultRoute: "/pedidos",
    routeMatchers: ["/recebimento", "/pedidos", "/comercial", "/vendas", "/administrativo-fetely/parceiros", "/credito/clientes", "/logistica", "/parceiros", "/canal-cpo"],
    icon: HandCoins,
    tela_slug: "tela.pedidos",
    appChaves: ["sops"],
  },
  {
    id: "comercial",
    label: "Comercial",
    defaultRoute: "/pedidos?aba=recuperacao",
    routeMatchers: ["/pedidos?aba=recuperacao"],
    icon: Boxes,
    tela_slug: "tela.comercial",
    appChaves: ["comercial"],
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
      "/meus-dados",
      "/meus-acessos",
      "/minhas-notas",
    ],
    icon: BookOpen,
    tela_slug: "tela.sncf",
    appChaves: ["acervo", "meu_espaco"],
  },
  {
    id: "mesa",
    label: "Mesa",
    defaultRoute: "/admin",
    routeMatchers: ["/admin", "/ti"],
    icon: Shield,
    tela_slug: null,
    hiddenFromTopNav: true,
    requireAdminRole: true,
  },
];
