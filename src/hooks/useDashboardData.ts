import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function getMonthRange(offset: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    competencia: start,
    startDate: `${start}-01`,
    endDate: end.toISOString().slice(0, 10),
    label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}

export function useDashboardData() {
  const { roles } = useAuth();
  const ehSuperAdmin = roles?.includes("super_admin") ?? false;
  const mesAtualRange = getMonthRange(0);
  const mesAnteriorRange = getMonthRange(-1);

  // Total CLT ativos
  const cltQuery = useQuery({
    queryKey: ["dashboard_clt"],
    queryFn: async () => {
      const { count: ativos } = await supabase
        .from("colaboradores_clt")
        .select("*", { count: "exact", head: true })
        .eq("status", "ativo");

      const { count: total } = await supabase
        .from("colaboradores_clt")
        .select("*", { count: "exact", head: true });

      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      const { count: experiencia } = await supabase
        .from("colaboradores_clt")
        .select("*", { count: "exact", head: true })
        .eq("status", "ativo")
        .gte("data_admissao", d90.toISOString().slice(0, 10));

      return { ativos: ativos ?? 0, total: total ?? 0, experiencia: experiencia ?? 0 };
    },
  });

  // Total PJ ativos
  const pjQuery = useQuery({
    queryKey: ["dashboard_pj"],
    queryFn: async () => {
      const { count: ativos } = await supabase
        .from("contratos_pj")
        .select("*", { count: "exact", head: true })
        .eq("status", "ativo");

      const d30 = new Date();
      d30.setDate(d30.getDate() + 30);
      const { count: vencendo } = await supabase
        .from("contratos_pj")
        .select("*", { count: "exact", head: true })
        .eq("status", "ativo")
        .not("data_fim", "is", null)
        .lte("data_fim", d30.toISOString().slice(0, 10));

      return { ativos: ativos ?? 0, vencendo: vencendo ?? 0 };
    },
  });

  // Headcount por departamento
  const headcountQuery = useQuery({
    queryKey: ["dashboard_headcount"],
    queryFn: async () => {
      const { data: cltData } = await supabase
        .from("colaboradores_clt")
        .select("departamento")
        .eq("status", "ativo");

      const { data: pjData } = await supabase
        .from("contratos_pj")
        .select("departamento")
        .eq("status", "ativo");

      const deptMap: Record<string, { clt: number; pj: number }> = {};
      (cltData || []).forEach((c) => {
        deptMap[c.departamento] = deptMap[c.departamento] || { clt: 0, pj: 0 };
        deptMap[c.departamento].clt++;
      });
      (pjData || []).forEach((c) => {
        deptMap[c.departamento] = deptMap[c.departamento] || { clt: 0, pj: 0 };
        deptMap[c.departamento].pj++;
      });

      return Object.entries(deptMap)
        .map(([dept, counts]) => ({ dept, ...counts }))
        .sort((a, b) => (b.clt + b.pj) - (a.clt + a.pj));
    },
  });

  // Férias em gozo
  const feriasQuery = useQuery({
    queryKey: ["dashboard_ferias"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count: emGozo } = await supabase
        .from("ferias_programacoes")
        .select("*", { count: "exact", head: true })
        .in("status", ["em_gozo", "aprovada"])
        .lte("data_inicio", today)
        .gte("data_fim", today);

      const { count: programadas } = await supabase
        .from("ferias_programacoes")
        .select("*", { count: "exact", head: true })
        .in("status", ["programada", "aprovada"])
        .gt("data_inicio", today);

      const { count: periodoVencido } = await supabase
        .from("ferias_periodos")
        .select("*", { count: "exact", head: true })
        .eq("status", "vencido")
        .gt("saldo", 0);

      return {
        emGozo: emGozo ?? 0,
        programadas: programadas ?? 0,
        periodoVencido: periodoVencido ?? 0,
      };
    },
  });

  // Aniversariantes do mês
  const aniversariantesQuery = useQuery({
    queryKey: ["dashboard_aniversariantes"],
    queryFn: async () => {
      const mes = new Date().getMonth() + 1;
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo, data_nascimento, departamento")
        .eq("status", "ativo");

      return (data || [])
        .filter((c) => {
          const m = new Date(c.data_nascimento + "T00:00:00").getMonth() + 1;
          return m === mes;
        })
        .map((c) => ({
          nome: c.nome_completo,
          data: new Date(c.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          depto: c.departamento,
        }))
        .sort((a, b) => a.data.localeCompare(b.data));
    },
  });

  // Status breakdown CLT
  const statusQuery = useQuery({
    queryKey: ["dashboard_status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("status");

      const counts: Record<string, number> = {};
      (data || []).forEach((c) => {
        counts[c.status] = (counts[c.status] || 0) + 1;
      });

      return counts;
    },
  });

  // Admissões vs Desligamentos (últimos 12 meses)
  const turnoverQuery = useQuery({
    queryKey: ["dashboard_turnover"],
    queryFn: async () => {
      const now = new Date();
      const months: { key: string; label: string; admissoes: number; desligamentos: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), admissoes: 0, desligamentos: 0 });
      }

      const startDate = `${months[0].key}-01`;
      const { data: admData } = await supabase
        .from("colaboradores_clt")
        .select("data_admissao")
        .gte("data_admissao", startDate);

      const { data: desData } = await supabase
        .from("colaboradores_clt")
        .select("data_desligamento")
        .not("data_desligamento", "is", null)
        .gte("data_desligamento", startDate);

      (admData || []).forEach((c) => {
        const key = c.data_admissao.slice(0, 7);
        const m = months.find((mo) => mo.key === key);
        if (m) m.admissoes++;
      });

      (desData || []).forEach((c: any) => {
        const key = c.data_desligamento.slice(0, 7);
        const m = months.find((mo) => mo.key === key);
        if (m) m.desligamentos++;
      });

      return months;
    },
  });

  // Folha atual e anterior (comparativo)
  const folhaComparativoQuery = useQuery({
    queryKey: ["dashboard_folha_comparativo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("folha_competencias")
        .select("competencia, status, total_bruto, total_liquido, total_encargos, total_colaboradores")
        .order("competencia", { ascending: false })
        .limit(3);

      const rows = data || [];
      const atual = rows[0] || null;
      const anterior = rows[1] || null;
      const anterior2 = rows[2] || null;
      return { atual, anterior, anterior2 };
    },
  });

  // Custo PJ mês atual vs anterior
  const custoPjComparativoQuery = useQuery({
    queryKey: ["dashboard_custo_pj_comparativo"],
    queryFn: async () => {
      // Soma dos valor_mensal de contratos ativos como base
      const { data: contratosPjAtivos } = await supabase
        .from("contratos_pj")
        .select("valor_mensal")
        .eq("status", "ativo");

      const totalContratosAtivos = (contratosPjAtivos || []).reduce((s, c) => s + Number(c.valor_mensal), 0);

      const { data: pagAtual } = await supabase
        .from("pagamentos_pj")
        .select("valor, status")
        .gte("data_prevista", mesAtualRange.startDate)
        .lte("data_prevista", mesAtualRange.endDate);

      const { data: pagAnterior } = await supabase
        .from("pagamentos_pj")
        .select("valor, status")
        .gte("data_prevista", mesAnteriorRange.startDate)
        .lte("data_prevista", mesAnteriorRange.endDate);

      const pagTotalAtual = (pagAtual || []).reduce((s, p) => s + Number(p.valor), 0);
      const pagTotalAnterior = (pagAnterior || []).reduce((s, p) => s + Number(p.valor), 0);

      // Usar o maior entre pagamentos registrados e valor dos contratos ativos
      const totalAtual = Math.max(pagTotalAtual, totalContratosAtivos);
      const totalAnterior = pagTotalAnterior > 0 ? pagTotalAnterior : totalContratosAtivos;

      const pagosAtual = (pagAtual || []).filter((p) => ["enviado_para_pagamento", "enviado_para_pagamento"].includes(p.status)).reduce((s, p) => s + Number(p.valor), 0);
      const pendentesAtual = (pagAtual || []).filter((p) => ["pendente", "aprovada", "enviada_pagamento"].includes(p.status)).reduce((s, p) => s + Number(p.valor), 0);

      return { totalAtual, totalAnterior, pagosAtual, pendentesAtual };
    },
  });

  // Custo total por mês (últimos 6 meses) para gráfico de evolução
  const custoEvolucaoQuery = useQuery({
    queryKey: ["dashboard_custo_evolucao"],
    queryFn: async () => {
      const { data: folhas } = await supabase
        .from("folha_competencias")
        .select("competencia, total_bruto, total_encargos")
        .order("competencia", { ascending: true })
        .limit(6);

      const now = new Date();
      const months: { label: string; key: string; clt: number; pj: number; total: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), clt: 0, pj: 0, total: 0 });
      }

      // Map folha data
      (folhas || []).forEach((f) => {
        const m = months.find((mo) => mo.key === f.competencia);
        if (m) m.clt = Number(f.total_bruto || 0) + Number(f.total_encargos || 0);
      });

      // Get PJ payments per month
      const startKey = months[0]?.key || "";
      if (startKey) {
        const { data: pags } = await supabase
          .from("pagamentos_pj")
          .select("valor, data_prevista")
          .gte("data_prevista", `${startKey}-01`);

        (pags || []).forEach((p) => {
          const key = p.data_prevista.slice(0, 7);
          const m = months.find((mo) => mo.key === key);
          if (m) m.pj += Number(p.valor);
        });
      }

      months.forEach((m) => { m.total = m.clt + m.pj; });
      return months;
    },
  });

  // Custo por departamento (CLT salários + PJ valores mensais)
  const custoDeptQuery = useQuery({
    queryKey: ["dashboard_custo_departamento", ehSuperAdmin],
    queryFn: async () => {
      const { data: cltData } = await supabase
        .from("colaboradores_clt")
        .select("departamento, salario_base, cargos:cargo_id(is_clevel)")
        .eq("status", "ativo");

      const { data: pjData } = await supabase
        .from("contratos_pj")
        .select("departamento, valor_mensal, cargos:cargo_id(is_clevel)")
        .eq("status", "ativo");

      const cltFiltrado = ehSuperAdmin
        ? (cltData || [])
        : (cltData || []).filter((c: any) => !c.cargos?.is_clevel);
      const pjFiltrado = ehSuperAdmin
        ? (pjData || [])
        : (pjData || []).filter((c: any) => !c.cargos?.is_clevel);

      const deptMap: Record<string, { clt: number; pj: number }> = {};
      cltFiltrado.forEach((c: any) => {
        deptMap[c.departamento] = deptMap[c.departamento] || { clt: 0, pj: 0 };
        deptMap[c.departamento].clt += Number(c.salario_base);
      });
      pjFiltrado.forEach((c: any) => {
        deptMap[c.departamento] = deptMap[c.departamento] || { clt: 0, pj: 0 };
        deptMap[c.departamento].pj += Number(c.valor_mensal);
      });

      return Object.entries(deptMap)
        .map(([dept, costs]) => ({ dept, clt: costs.clt, pj: costs.pj, total: costs.clt + costs.pj }))
        .sort((a, b) => b.total - a.total);
    },
  });

  // NFs pendentes
  const nfQuery = useQuery({
    queryKey: ["dashboard_nf_pendentes"],
    queryFn: async () => {
      const { count } = await supabase
        .from("notas_fiscais_pj")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente");
      return count ?? 0;
    },
  });

  // Pagamentos PJ pendentes
  const pagPjQuery = useQuery({
    queryKey: ["dashboard_pag_pj_pendentes"],
    queryFn: async () => {
      const { count } = await supabase
        .from("pagamentos_pj")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente");
      return count ?? 0;
    },
  });

  // Experiência vencendo (45/90 dias)
  const experienciaQuery = useQuery({
    queryKey: ["dashboard_experiencia_vencendo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo, data_admissao, tipo_contrato, departamento")
        .eq("status", "ativo")
        .in("tipo_contrato", ["experiencia", "indeterminado"]);

      const today = new Date();
      const alertas: { nome: string; diasRestantes: number; marco: number; depto: string }[] = [];

      (data || []).forEach((c) => {
        const admissao = new Date(c.data_admissao + "T00:00:00");
        const diffDias = Math.floor((today.getTime() - admissao.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias >= 35 && diffDias <= 45) {
          alertas.push({ nome: c.nome_completo, diasRestantes: 45 - diffDias, marco: 45, depto: c.departamento });
        } else if (diffDias >= 80 && diffDias <= 90) {
          alertas.push({ nome: c.nome_completo, diasRestantes: 90 - diffDias, marco: 90, depto: c.departamento });
        }
      });

      return alertas;
    },
  });

  // Documentos vencendo (CNH)
  const docsVencendoQuery = useQuery({
    queryKey: ["dashboard_docs_vencendo"],
    queryFn: async () => {
      const d30 = new Date();
      d30.setDate(d30.getDate() + 30);
      const today = new Date().toISOString().slice(0, 10);

      const { data } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo, cnh_validade, departamento")
        .eq("status", "ativo")
        .not("cnh_validade", "is", null)
        .lte("cnh_validade", d30.toISOString().slice(0, 10));

      return (data || []).map((c) => ({
        nome: c.nome_completo,
        documento: "CNH",
        validade: c.cnh_validade!,
        vencido: c.cnh_validade! < today,
        depto: c.departamento,
      }));
    },
  });

  // Aniversários de empresa
  const anivEmpresaQuery = useQuery({
    queryKey: ["dashboard_aniv_empresa"],
    queryFn: async () => {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo, data_admissao, departamento")
        .eq("status", "ativo");

      const now = new Date();
      const mesAtual = now.getMonth();
      const anoAtual = now.getFullYear();
      const marcos = [1, 5, 10, 15, 20, 25, 30];

      return (data || [])
        .map((c) => {
          const admissao = new Date(c.data_admissao + "T00:00:00");
          if (admissao.getMonth() !== mesAtual) return null;
          const anos = anoAtual - admissao.getFullYear();
          if (!marcos.includes(anos)) return null;
          return {
            nome: c.nome_completo,
            anos,
            data: admissao.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            depto: c.departamento,
          };
        })
        .filter(Boolean) as { nome: string; anos: number; data: string; depto: string }[];
    },
  });

  // Colaboradores ativos sem benefícios
  const semBeneficioQuery = useQuery({
    queryKey: ["dashboard_sem_beneficio"],
    queryFn: async () => {
      const { data: colaboradores } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo, departamento")
        .eq("status", "ativo");

      const { data: beneficios } = await supabase
        .from("beneficios_colaborador")
        .select("colaborador_id")
        .eq("status", "ativo");

      const comBeneficio = new Set((beneficios || []).map((b) => b.colaborador_id));

      return (colaboradores || [])
        .filter((c) => !comBeneficio.has(c.id))
        .map((c) => ({ nome: c.nome_completo, depto: c.departamento }));
    },
  });

  // Contratos PJ sem assinatura
  const contratosPendentesQuery = useQuery({
    queryKey: ["dashboard_contratos_pendentes"],
    queryFn: async () => {
      const { data } = await (supabase
        .from("contratos_pj")
        .select("id, razao_social, contato_nome, departamento, contrato_assinado") as any)
        .in("status", ["ativo", "rascunho"])
        .eq("contrato_assinado", false);

      return (data || []).map((c: any) => ({
        id: c.id,
        nome: c.razao_social || c.contato_nome,
        depto: c.departamento,
      }));
    },
  });

  // Convites preenchidos pendentes de cadastro
  const convitesPreenchidosQuery = useQuery({
    queryKey: ["dashboard_convites_preenchidos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("convites_cadastro")
        .select("id, nome, tipo, cargo, departamento")
        .eq("status", "preenchido");

      return (data || []).map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        cargo: c.cargo,
        depto: c.departamento,
      }));
    },
  });

  // Salário médio CLT
  const salarioMedioQuery = useQuery({
    queryKey: ["dashboard_salario_medio", ehSuperAdmin],
    queryFn: async () => {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("salario_base, cargos:cargo_id(is_clevel)")
        .eq("status", "ativo");

      const filtrado = ehSuperAdmin
        ? (data || [])
        : (data || []).filter((c: any) => !c.cargos?.is_clevel);

      const salarios = filtrado.map((c: any) => Number(c.salario_base));
      if (salarios.length === 0) return { medio: 0, total: 0, count: 0 };
      const total = salarios.reduce((a, b) => a + b, 0);
      return { medio: total / salarios.length, total, count: salarios.length };
    },
  });

  // Sugestões pendentes (inbox RH)
  const sugestoesPendentesQuery = useQuery({
    queryKey: ["dashboard-sugestoes-pendentes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("processos_sugestoes")
        .select(`
          id, titulo_sugerido, descricao, origem, sugerido_em,
          processo_id, processos:processo_id (id, nome, codigo)
        `)
        .eq("status", "pendente")
        .order("sugerido_em", { ascending: false })
        .limit(10);
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const isLoading = cltQuery.isLoading || pjQuery.isLoading || headcountQuery.isLoading;

  return {
    clt: cltQuery.data ?? { ativos: 0, total: 0, experiencia: 0 },
    pj: pjQuery.data ?? { ativos: 0, vencendo: 0 },
    headcount: headcountQuery.data ?? [],
    ferias: feriasQuery.data ?? { emGozo: 0, programadas: 0, periodoVencido: 0 },
    aniversariantes: aniversariantesQuery.data ?? [],
    statusClt: statusQuery.data ?? {},
    turnover: turnoverQuery.data ?? [],
    folha: folhaComparativoQuery.data ?? { atual: null, anterior: null, anterior2: null },
    nfPendentes: nfQuery.data ?? 0,
    pagPjPendentes: pagPjQuery.data ?? 0,
    experienciaVencendo: experienciaQuery.data ?? [],
    docsVencendo: docsVencendoQuery.data ?? [],
    aniversariosEmpresa: anivEmpresaQuery.data ?? [],
    semBeneficio: semBeneficioQuery.data ?? [],
    contratosPendentes: contratosPendentesQuery.data ?? [],
    convitesPreenchidos: convitesPreenchidosQuery.data ?? [],
    custoPj: custoPjComparativoQuery.data ?? { totalAtual: 0, totalAnterior: 0, pagosAtual: 0, pendentesAtual: 0 },
    custoEvolucao: custoEvolucaoQuery.data ?? [],
    custoDept: custoDeptQuery.data ?? [],
    salarioMedio: salarioMedioQuery.data ?? { medio: 0, total: 0, count: 0 },
    sugestoesPendentes: sugestoesPendentesQuery.data ?? [],
    agregadosExcluemClevel: !ehSuperAdmin,
    mesAtualLabel: mesAtualRange.label,
    mesAnteriorLabel: mesAnteriorRange.label,
    isLoading,
  };
}
