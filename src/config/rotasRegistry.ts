// ──────────────────────────────────────────────────────────────
// Registro de Rotas — Portão de Acesso (Fase 1, hardcoded).
// Fase 2: promover `status` e `perfis` para tabela sncf_rotas_config
// + tela admin onde super_admin flipa sem deploy (Dimensão Visível).
// ──────────────────────────────────────────────────────────────

export type StatusRota = "pronta" | "em_construcao";

// Perfis de acesso. super_admin NÃO entra aqui (faz bypass total no gate).
export type PerfilAcesso = "amplo" | "credito";

export interface RegraRota {
  // Casa o pathname exato OU qualquer coisa abaixo (prefixo + "/...").
  prefixo: string;
  status: StatusRota;
  // Quem entra QUANDO a rota está "pronta".
  perfis: PerfilAcesso[];
}

// ──────────────────────────────────────────────────────────────
// MÁSCARA SIMPLES (Fase 1): e-mail → perfil restrito.
// Quem NÃO está aqui e não é super_admin = perfil "amplo" (Joseph).
// FLÁVIO: troque pelo e-mail REAL do analista de crédito (minúsculas).
// ──────────────────────────────────────────────────────────────
export const EMAIL_TO_PERFIL: Record<string, PerfilAcesso> = {
  "analista.credito@fetely.com.br": "credito",
};

// ──────────────────────────────────────────────────────────────
// REGISTRO. Match por prefixo MAIS LONGO. Não listado = DENY.
//
// FLÁVIO: a ÚNICA coluna que você precisa revisar é `status`.
//   - "pronta"        → Joseph (amplo) vê.
//   - "em_construcao" → só você (super_admin) vê.
// Crédito está travado em "pronta" (é o que o analista usa).
// People/RH e Gestão à Vista deixei "em_construcao" por padrão SEGURO
// (não sei o estado real delas) — vire "pronta" o que você confia.
// ──────────────────────────────────────────────────────────────
export const ROTAS: RegraRota[] = [
  // Home + self-service (todos, inclusive analista)
  { prefixo: "/", status: "pronta", perfis: ["amplo", "credito"] },
  { prefixo: "/meus-dados", status: "pronta", perfis: ["amplo", "credito"] },
  { prefixo: "/meus-acessos", status: "pronta", perfis: ["amplo", "credito"] },
  { prefixo: "/minhas-notas", status: "pronta", perfis: ["amplo", "credito"] },

  // Crédito — app do analista (TRAVADO pronta)
  { prefixo: "/credito", status: "pronta", perfis: ["amplo", "credito"] },

  // Casa dos Pedidos / SNCF
  { prefixo: "/pedidos", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/parceiros", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/sncf", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/tarefas", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/processos", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/templates", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/fala-fetely", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/documentacao", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/compras", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/ti", status: "pronta", perfis: ["amplo"] },

  // Financeiro
  { prefixo: "/administrativo-fetely", status: "pronta", perfis: ["amplo"] },
  { prefixo: "/administrativo", status: "pronta", perfis: ["amplo"] },

  // People / RH — REVISAR (padrão seguro = em_construcao)
  { prefixo: "/pessoas", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/colaboradores", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/organograma", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/movimentacoes", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/folha-pagamento", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/ferias", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/ponto", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/beneficios", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/contratos-pj", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/notas-fiscais", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/pagamentos-pj", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/convites-cadastro", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/onboarding", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/recrutamento", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/avaliacoes", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/treinamentos", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/desligamento", status: "em_construcao", perfis: ["amplo"] },

  // Gestão à Vista — REVISAR (gestao-a-vista hoje mostra "Em construção")
  { prefixo: "/dashboard", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/gestao-a-vista", status: "em_construcao", perfis: ["amplo"] },
  { prefixo: "/relatorios", status: "em_construcao", perfis: ["amplo"] },

  // Administração do sistema — só super_admin (perfis vazio = ninguém amplo).
  // super_admin faz bypass no gate, então continua acessando.
  { prefixo: "/admin", status: "pronta", perfis: [] },
];

// Resolve a regra por prefixo MAIS LONGO. Retorna null se não houver match.
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

// Perfil do usuário (Fase 1: máscara por e-mail). super_admin tratado fora.
export function perfilDoEmail(email: string | null | undefined): PerfilAcesso {
  const e = (email || "").trim().toLowerCase();
  return EMAIL_TO_PERFIL[e] ?? "amplo";
}
