// Catálogo de módulos usado só pela matriz de permissões (UI).
export const MODULES = [
  // Portal SNCF
  { key: "dashboard", label: "Dashboard People", category: "sncf" },
  { key: "tarefas", label: "Minhas Tarefas", category: "sncf" },
  { key: "tarefas_time", label: "Tarefas do Time", category: "sncf" },
  { key: "fala_fetely", label: "Fala Fetely (chat)", category: "sncf" },

  // Fala Fetely — Gestão
  { key: "conhecimento_fetely", label: "Base de Conhecimento", category: "fala_fetely" },
  { key: "memorias_fetely", label: "Minhas Memórias", category: "fala_fetely" },
  { key: "importacao_pdf", label: "Importação de PDF", category: "fala_fetely" },
  { key: "sugestoes_conhecimento", label: "Sugestões de Conhecimento", category: "fala_fetely" },

  // People Fetely
  { key: "pessoas", label: "Pessoas (CLT + PJ)", category: "people" },
  { key: "colaboradores", label: "Colaboradores CLT", category: "people" },
  { key: "contratos_pj", label: "Contratos PJ", category: "people" },
  { key: "organograma", label: "Organograma", category: "people" },
  { key: "onboarding", label: "Onboarding", category: "people" },
  { key: "ferias", label: "Férias", category: "people" },
  { key: "beneficios", label: "Benefícios", category: "people" },
  { key: "movimentacoes", label: "Movimentações", category: "people" },
  { key: "recrutamento", label: "Recrutamento", category: "people" },
  { key: "avaliacoes", label: "Avaliações", category: "people" },
  { key: "treinamentos", label: "Treinamentos", category: "people" },

  // Financeiro
  { key: "folha_pagamento", label: "Folha de Pagamento", category: "financeiro" },
  { key: "notas_fiscais", label: "Notas Fiscais", category: "financeiro" },
  { key: "pagamentos_pj", label: "Pagamentos PJ", category: "financeiro" },
  { key: "cargos", label: "Cargos e Salários", category: "financeiro" },

  // TI Fetely
  { key: "ti_ativos", label: "Ativos de TI", category: "ti" },
  { key: "documentacao", label: "Documentação Viva", category: "ti" },

  // Administração
  { key: "processos", label: "Processos", category: "admin" },
  { key: "convites", label: "Convites de Cadastro", category: "admin" },
  { key: "parametros", label: "Parâmetros", category: "admin" },
  { key: "usuarios", label: "Gerenciar Usuários", category: "admin" },
  { key: "relatorios", label: "Relatórios", category: "admin" },
] as const;

export const MODULE_CATEGORIES = [
  { key: "sncf", label: "Portal SNCF", color: "text-purple-700 dark:text-purple-400" },
  { key: "fala_fetely", label: "Fala Fetely", color: "text-pink-700 dark:text-pink-400" },
  { key: "people", label: "People Fetely", color: "text-emerald-700 dark:text-emerald-400" },
  { key: "financeiro", label: "Financeiro", color: "text-amber-700 dark:text-amber-400" },
  { key: "ti", label: "TI Fetely", color: "text-cyan-700 dark:text-cyan-400" },
  { key: "admin", label: "Administração", color: "text-slate-700 dark:text-slate-400" },
] as const;
