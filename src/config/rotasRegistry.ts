export type StatusRota = "pronta" | "em_construcao";

export interface RegraRota {
  prefixo: string;
  status: StatusRota;
  tela_slug: string | null; // null = só super_admin via bypass
}

// FLÁVIO: para controlar o que o Joseph (e qualquer usuário amplo) vê,
// mude o status desta lista: "pronta" = aparece, "em_construcao" = escondido.
// Para controlar quem acessa, gerencie os grupos no banco ou na tela de admin (Fase 2).
export const ROTAS: RegraRota[] = [
  // Sempre acessíveis (TELAS_PUBLICAS no RotaGate)
  { prefixo: "/",              status: "pronta",        tela_slug: "tela.home"        },
  { prefixo: "/meus-dados",    status: "pronta",        tela_slug: "tela.self"        },
  { prefixo: "/meus-acessos",  status: "pronta",        tela_slug: "tela.self"        },
  { prefixo: "/minhas-notas",  status: "pronta",        tela_slug: "tela.self"        },
  // Crédito
  { prefixo: "/credito",       status: "pronta",        tela_slug: "tela.credito"     },
  // Pedidos / Casa
  { prefixo: "/pedidos",       status: "pronta",        tela_slug: "tela.pedidos"     },
  { prefixo: "/parceiros",     status: "pronta",        tela_slug: "tela.pedidos"     },
  { prefixo: "/vendas/gestao-pedidos", status: "pronta", tela_slug: "tela.gestao_pedidos" },
  // Comercial
  { prefixo: "/comercial",     status: "pronta",        tela_slug: "tela.comercial"   },
  // SNCF
  { prefixo: "/sncf",          status: "pronta",        tela_slug: "tela.sncf"        },
  { prefixo: "/tarefas",       status: "pronta",        tela_slug: "tela.tarefas"     },
  { prefixo: "/processos",     status: "pronta",        tela_slug: "tela.processos"   },
  { prefixo: "/templates",     status: "pronta",        tela_slug: "tela.processos"   },
  { prefixo: "/fala-fetely",   status: "pronta",        tela_slug: "tela.fala_fetely" },
  { prefixo: "/documentacao",  status: "pronta",        tela_slug: "tela.documentacao"},
  { prefixo: "/compras",       status: "pronta",        tela_slug: "tela.compras"     },
  { prefixo: "/ti",            status: "pronta",        tela_slug: "tela.ti"          },
  // Financeiro
  { prefixo: "/administrativo-fetely", status: "pronta", tela_slug: "tela.admin_fetely" },
  { prefixo: "/administrativo",        status: "pronta", tela_slug: "tela.financeiro"   },
  // Admin do sistema (só super_admin via bypass — slug null = bloqueia todos os outros)
  { prefixo: "/admin",         status: "pronta",        tela_slug: null               },
  // Em construção — bloqueados antes da checagem de slug
  { prefixo: "/pessoas",          status: "em_construcao", tela_slug: null },
  { prefixo: "/colaboradores",    status: "em_construcao", tela_slug: null },
  { prefixo: "/organograma",      status: "em_construcao", tela_slug: null },
  { prefixo: "/movimentacoes",    status: "em_construcao", tela_slug: null },
  { prefixo: "/folha-pagamento",  status: "em_construcao", tela_slug: null },
  { prefixo: "/ferias",           status: "em_construcao", tela_slug: null },
  { prefixo: "/ponto",            status: "em_construcao", tela_slug: null },
  { prefixo: "/beneficios",       status: "em_construcao", tela_slug: null },
  { prefixo: "/contratos-pj",     status: "em_construcao", tela_slug: null },
  { prefixo: "/notas-fiscais",    status: "em_construcao", tela_slug: null },
  { prefixo: "/pagamentos-pj",    status: "em_construcao", tela_slug: null },
  { prefixo: "/convites-cadastro",status: "em_construcao", tela_slug: null },
  { prefixo: "/onboarding",       status: "em_construcao", tela_slug: null },
  { prefixo: "/recrutamento",     status: "em_construcao", tela_slug: null },
  { prefixo: "/avaliacoes",       status: "em_construcao", tela_slug: null },
  { prefixo: "/treinamentos",     status: "em_construcao", tela_slug: null },
  { prefixo: "/desligamento",     status: "em_construcao", tela_slug: null },
  { prefixo: "/dashboard",        status: "em_construcao", tela_slug: null },
  { prefixo: "/gestao-a-vista",   status: "em_construcao", tela_slug: null },
  { prefixo: "/relatorios",       status: "em_construcao", tela_slug: null },
];

export function resolverRegraRota(pathname: string): RegraRota | null {
  let melhor: RegraRota | null = null;
  for (const r of ROTAS) {
    const casa = pathname === r.prefixo || pathname.startsWith(r.prefixo + "/");
    if (casa && (!melhor || r.prefixo.length > melhor.prefixo.length)) {
      melhor = r;
    }
  }
  return melhor;
}
