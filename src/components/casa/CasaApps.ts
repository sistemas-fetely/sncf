import { Home, Users, Wallet, CreditCard, HandCoins, BookOpen, User, Monitor, Shield, LucideIcon } from "lucide-react";

export interface CasaApp {
  /** Identificador interno */
  id: "casa" | "meu_espaco" | "recebimento" | "financas" | "pessoas" | "credito" | "acervo" | "ti" | "mesa";
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

/**
 * ORDEM-POR-FREQUENCIA (23/08/2026): Casa e Meu Espaço primeiro — são os dois
 * únicos que toda pessoa tem, independente de área. Depois os módulos por
 * volume de uso: SOPs (operação diária), Finanças, Pessoas, Crédito, Acervo, TI.
 * O rodapé do mobile (CasaBottomNav) segue a mesma lógica.
 */
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
    // Meu Espaço virou pilar próprio em 22/08/2026. Estava engolido dentro de
    // Acervo, apesar de ser um dos 5 fixos do rodapé desde a decisão de 29/07.
    // tela.self é pública — aparece pra todo mundo, é a área pessoal.
    id: "meu_espaco",
    label: "Meu Espaço",
    defaultRoute: "/tarefas/hoje",
    routeMatchers: [
      "/tarefas",
      "/meus-dados",
      "/meus-acessos",
      "/minhas-notas",
      "/fala-fetely/memorias",
    ],
    icon: User,
    tela_slug: "tela.self",
    appChaves: ["meu_espaco"],
  },
  {
    id: "recebimento",
    label: "SOPs",
    defaultRoute: "/pedidos",
    routeMatchers: ["/recebimento", "/pedidos", "/cliente", "/comercial", "/vendas", "/administrativo-fetely/parceiros", "/credito/clientes", "/logistica", "/parceiros", "/canal-cpo"],
    icon: HandCoins,
    tela_slug: "tela.pedidos",
    appChaves: ["sops"],
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
  // Pilar "Patrimônio" desmontado em 23/08/2026 (DESMONTE-PATRIMONIO):
  // Contratos → Finanças, GED → TI, Imóveis/Seguros nunca construídos.
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
      "/desligamento",
      "/movimentacoes",
      "/dashboard",
      "/gestao-a-vista",
      "/relatorios",
      "/avaliacoes",
      "/treinamentos",
    ],
    icon: Users,
    tela_slug: "tela.pessoas",
    slugPrefix: "tela.pessoas_",
    appChaves: ["pessoas"],
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
    id: "acervo",
    label: "Acervo",
    defaultRoute: "/processos",
    routeMatchers: [
      "/documentacao",
      "/processos",
      "/fala-fetely",
    ],
    icon: BookOpen,
    tela_slug: "tela.sncf",
    appChaves: ["acervo"],
  },
  {
    // TI virou pilar próprio em 22/08/2026 (Regra de Ouro dos Menus: TI = infra,
    // pilar próprio; Mesa = config global). Estava dobrado dentro de Mesa, que
    // é hiddenFromTopNav — então o TI só era alcançável pelo menu do avatar.
    //
    // Sem impacto de acesso: as 5 pessoas com tela.ti são todas super_admin, e
    // o TILayout já libera super_admin por papel antes de qualquer checagem.
    id: "ti",
    label: "TI",
    defaultRoute: "/ti",
    routeMatchers: ["/ti"],
    icon: Monitor,
    tela_slug: "tela.ti",
    appChaves: ["ti"],
  },
  {
    id: "mesa",
    label: "Mesa",
    defaultRoute: "/admin",
    routeMatchers: ["/admin"],
    icon: Shield,
    tela_slug: null,
    hiddenFromTopNav: true,
    requireAdminRole: true,
  },
];
