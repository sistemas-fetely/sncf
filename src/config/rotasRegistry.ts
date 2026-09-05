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
  // Painel do Cliente: a PORTA é tela.cliente (linha com.cliente em sncf_navegacao,
  // acesso_por=tela_mae). As 6 abas são lentes com slug próprio (tela.cliente_*) e
  // continuam fail-closed: ninguém entra sem concessão da porta e, dentro, cada um
  // só vê as lentes que tem.
  { prefixo: "/cliente",       status: "pronta",        tela_slug: "tela.cliente"     },

  { prefixo: "/vendas/gestao-pedidos", status: "pronta", tela_slug: "tela.gestao_pedidos" },
  // Produto / Acervo
  { prefixo: "/vendas/produto/estoque/destinos", status: "pronta", tela_slug: "tela.produto" },
  // Comercial
  { prefixo: "/comercial",     status: "pronta",        tela_slug: "tela.comercial"   },
  // SNCF
  
  { prefixo: "/tarefas",       status: "pronta",        tela_slug: "tela.tarefas"     },
  { prefixo: "/processos",     status: "pronta",        tela_slug: "tela.processos"   },
  { prefixo: "/templates",     status: "pronta",        tela_slug: "tela.processos"   },
  { prefixo: "/fala-fetely",   status: "pronta",        tela_slug: "tela.fala_fetely" },
  { prefixo: "/documentacao",  status: "pronta",        tela_slug: "tela.documentacao"},
  { prefixo: "/compras",       status: "pronta",        tela_slug: "tela.compras"     },
  { prefixo: "/logistica/chegada-mercadoria", status: "pronta", tela_slug: "tela.chegada_mercadoria" },
  { prefixo: "/ti",            status: "pronta",        tela_slug: "tela.ti"          },
  // Financeiro
  // Contratos era do pilar Patrimônio (DESMONTE-PATRIMONIO, 23/08/2026): preserva o
  // slug tela.admin_fetely para quem já tinha acesso. Prefixo mais longo vence o /administrativo.
  { prefixo: "/administrativo/contratos", status: "pronta", tela_slug: "tela.admin_fetely" },
  // Telas de Finanças com slug próprio (recorte Board). Match por prefixo mais
  // longo: estas vencem o /administrativo base. As não listadas caem em
  // tela.financeiro (guarda-chuva) — só quem tem acesso total as vê.
  { prefixo: "/administrativo/caixa-banco/contas", status: "pronta", tela_slug: "tela.fin_contas_bancarias" },
  { prefixo: "/administrativo/contas-receber", status: "pronta", tela_slug: "tela.fin_receber" },
  { prefixo: "/administrativo/caixa-banco", status: "pronta", tela_slug: "tela.fin_movimentacoes" },
  { prefixo: "/administrativo/plano-contas", status: "pronta", tela_slug: "tela.fin_plano_contas" },
  { prefixo: "/administrativo/auditoria", status: "pronta", tela_slug: "tela.fin_auditoria" },
  { prefixo: "/administrativo",        status: "pronta", tela_slug: "tela.financeiro"   },
  // Admin do sistema — slug null = só super_admin via bypass
  // EXCETO /pessoas/cargos, que o Board pode ver com slug próprio
  { prefixo: "/pessoas/cargos",  status: "pronta",        tela_slug: "tela.cargos"      },
  { prefixo: "/admin",         status: "pronta",        tela_slug: null               },
  // People — abertas para Board (em_construcao para os demais)
  { prefixo: "/pessoas",       status: "pronta",        tela_slug: "tela.pessoas"     },
  { prefixo: "/organograma",   status: "pronta",        tela_slug: "tela.organograma" },
  { prefixo: "/folha-pagamento", status: "pronta",      tela_slug: "tela.folha_pagamento" },
  // Em construção — bloqueados antes da checagem de slug
  { prefixo: "/colaboradores",    status: "em_construcao", tela_slug: null },
  { prefixo: "/movimentacoes",    status: "em_construcao", tela_slug: null },
  { prefixo: "/ferias",           status: "em_construcao", tela_slug: null },
  { prefixo: "/ponto",            status: "em_construcao", tela_slug: null },
  { prefixo: "/beneficios",       status: "em_construcao", tela_slug: null },
  { prefixo: "/contratos-pj",     status: "em_construcao", tela_slug: null },
  { prefixo: "/notas-fiscais",    status: "em_construcao", tela_slug: null },
  { prefixo: "/pagamentos-pj",    status: "em_construcao", tela_slug: null },
  { prefixo: "/onboarding",       status: "em_construcao", tela_slug: null },
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
