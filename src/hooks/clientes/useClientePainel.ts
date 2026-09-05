/**
 * PAINEL DO CLIENTE — camada de dados própria da tela /cliente/:id.
 *
 * Só leitura. As perguntas de dinheiro continuam nos hooks de
 * `useContaCliente` (saldo, extrato, cobertura, furos); aqui ficam o cabeçalho
 * de cadastro e a análise de crédito vigente.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClienteCadastro {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  inscricao_estadual: string | null;
  isento_ie: boolean | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  nivel_programa: string | null;
  perfil_credito: string | null;
  ativo: boolean | null;
}

export const QK_CLIENTE_CADASTRO = "cliente-painel-cadastro";
export const QK_CLIENTE_ANALISE_VIGENTE = "cliente-painel-analise-vigente";

/** Cabeçalho + aba Cadastro. Uma consulta só serve as duas. */
export function useClienteCadastro(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_CADASTRO, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ClienteCadastro | null> => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select(
          "id, razao_social, nome_fantasia, cnpj, cpf, inscricao_estadual, isento_ie, telefone, email, cep, logradouro, numero, bairro, cidade, uf, nivel_programa, perfil_credito, ativo",
        )
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClienteCadastro | null;
    },
  });
}

export interface AnaliseCreditoVigente {
  id: string;
  status_final: string | null;
  estagio_atual: string | null;
  limite_concedido: number | null;
  prazo_max_dias: number | null;
  validade_ate: string | null;
  parecer_final: string | null;
  ressalva: string | null;
  perfil_aplicado: string | null;
  decidido_em: string | null;
  criado_em: string | null;
}

/** Última análise DECIDIDA do parceiro. Somente leitura. */
export function useAnaliseCreditoVigente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_ANALISE_VIGENTE, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<AnaliseCreditoVigente | null> => {
      const { data, error } = await (supabase as any)
        .from("analises_credito")
        .select(
          "id, status_final, estagio_atual, limite_concedido, prazo_max_dias, validade_ate, parecer_final, ressalva, perfil_aplicado, decidido_em, criado_em",
        )
        .eq("parceiro_id", parceiroId)
        .not("status_final", "is", null)
        .order("decidido_em", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as any),
        limite_concedido:
          (data as any).limite_concedido == null ? null : Number((data as any).limite_concedido),
      } as AnaliseCreditoVigente;
    },
  });
}

export interface KpiCliente {
  parceiro_id: string;
  utilizacao_limite_pct: number | null;
  pmr_dias: number | null;
  prazo_medio_concedido: number | null;
  atraso_medio_dias: number | null;
  pontualidade_pct: number | null;
  pagamento_antecipado_pct: number | null;
  pior_atraso_dias: number | null;
  titulos_pagos: number | null;
  pedidos_faturados: number | null;
  ticket_medio: number | null;
  total_faturado: number | null;
  ultima_compra: string | null;
  primeira_compra: string | null;
  dias_desde_ultima_compra: number | null;
  limite_concedido: number | null;
  prazo_max_dias: number | null;
  validade_ate: string | null;
  saldo: number | null;
  vencido_em_aberto: number | null;
  a_vencer: number | null;
}

export const QK_CLIENTE_KPI = "cliente-painel-kpi";

/** Indicadores de comportamento do cliente. Uma linha por parceiro. Só leitura. */
export function useKpiCliente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_KPI, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<KpiCliente | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_kpi")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const num = (v: unknown) => (v == null ? null : Number(v));
      const d = data as Record<string, unknown>;
      return {
        ...(data as any),
        utilizacao_limite_pct: num(d.utilizacao_limite_pct),
        pmr_dias: num(d.pmr_dias),
        prazo_medio_concedido: num(d.prazo_medio_concedido),
        atraso_medio_dias: num(d.atraso_medio_dias),
        pontualidade_pct: num(d.pontualidade_pct),
        pagamento_antecipado_pct: num(d.pagamento_antecipado_pct),
        pior_atraso_dias: num(d.pior_atraso_dias),
        titulos_pagos: num(d.titulos_pagos),
        pedidos_faturados: num(d.pedidos_faturados),
        ticket_medio: num(d.ticket_medio),
        total_faturado: num(d.total_faturado),
        dias_desde_ultima_compra: num(d.dias_desde_ultima_compra),
        limite_concedido: num(d.limite_concedido),
        prazo_max_dias: num(d.prazo_max_dias),
        saldo: num(d.saldo),
        vencido_em_aberto: num(d.vencido_em_aberto),
        a_vencer: num(d.a_vencer),
      } as KpiCliente;
    },
  });
}

export interface SerieMensalCliente {
  mes: string;
  rotulo: string;
  faturado: number;
  recebido: number;
  saldo_acumulado: number;
}

export const QK_CLIENTE_SERIE_MENSAL = "cliente-painel-serie-mensal";

/** Últimos 12 meses com movimento. Só leitura. */
export function useSerieMensalCliente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_SERIE_MENSAL, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<SerieMensalCliente[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_serie_mensal")
        .select("mes, rotulo, faturado, recebido, saldo_acumulado")
        .eq("parceiro_id", parceiroId)
        .order("mes", { ascending: false })
        .limit(12);
      if (error) throw error;
      const linhas = ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        mes: String(d.mes ?? ""),
        rotulo: String(d.rotulo ?? ""),
        faturado: Number(d.faturado ?? 0),
        recebido: Number(d.recebido ?? 0),
        saldo_acumulado: Number(d.saldo_acumulado ?? 0),
      }));
      return linhas.reverse();
    },
  });
}

export interface ProdutoCliente {
  parceiro_id: string;
  eixo: "familia" | "colecao";
  grupo: string;
  valor: number;
  quantidade: number;
  pedidos: number;
  skus: number;
  ultima_compra: string | null;
  recomprado: boolean | null;
}

export const QK_CLIENTE_PRODUTOS = "cliente-painel-produtos";

/**
 * Composição do faturamento por taxonomia derivada (família e coleção).
 * Uma consulta só; o componente separa por `eixo`. Só leitura.
 */
export function useProdutosCliente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_PRODUTOS, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ProdutoCliente[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_produtos")
        .select("parceiro_id, eixo, grupo, valor, quantidade, pedidos, skus, ultima_compra, recomprado")
        .eq("parceiro_id", parceiroId)
        .order("valor", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        parceiro_id: String(d.parceiro_id ?? ""),
        eixo: (String(d.eixo ?? "familia") as "familia" | "colecao"),
        grupo: String(d.grupo ?? "—"),
        valor: Number(d.valor ?? 0),
        quantidade: Number(d.quantidade ?? 0),
        pedidos: Number(d.pedidos ?? 0),
        skus: Number(d.skus ?? 0),
        ultima_compra: d.ultima_compra == null ? null : String(d.ultima_compra),
        recomprado: d.recomprado == null ? null : Boolean(d.recomprado),
      }));
    },
  });
}


export interface RecompraCliente {
  parceiro_id: string;
  compras: number;
  primeira: string | null;
  ultima: string | null;
  dias_desde_ultima: number | null;
  intervalo_medio_dias: number | null;
  proxima_compra_estimada: string | null;
  atrasado_recompra: boolean | null;
  skus_recomprados: number | null;
  skus_distintos: number | null;
  colecoes_recompradas: number | null;
  colecoes_distintas: number | null;

}

export const QK_CLIENTE_RECOMPRA = "cliente-painel-recompra";

/** Ritmo de recompra do cliente. Uma linha por parceiro. Só leitura. */
export function useRecompraCliente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_RECOMPRA, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<RecompraCliente | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_recompra")
        .select("parceiro_id, compras, primeira, ultima, dias_desde_ultima, intervalo_medio_dias, proxima_compra_estimada, atrasado_recompra, skus_recomprados, skus_distintos, colecoes_recompradas, colecoes_distintas")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as Record<string, unknown>;
      const num = (v: unknown) => (v == null ? null : Number(v));
      return {
        parceiro_id: String(d.parceiro_id ?? ""),
        compras: Number(d.compras ?? 0),
        primeira: d.primeira == null ? null : String(d.primeira),
        ultima: d.ultima == null ? null : String(d.ultima),
        dias_desde_ultima: num(d.dias_desde_ultima),
        intervalo_medio_dias: num(d.intervalo_medio_dias),
        proxima_compra_estimada: d.proxima_compra_estimada == null ? null : String(d.proxima_compra_estimada),
        atrasado_recompra: d.atrasado_recompra == null ? null : Boolean(d.atrasado_recompra),
        skus_recomprados: num(d.skus_recomprados),
        skus_distintos: num(d.skus_distintos),
        colecoes_recompradas: num(d.colecoes_recompradas),
        colecoes_distintas: num(d.colecoes_distintas),

      };
    },
  });
}


export interface MixCliente {
  parceiro_id: string;
  familia: string;
  valor_cliente: number;
  pct_cliente: number;
  pct_carteira: number;
  gap_pp: number;
  nunca_comprou: boolean;
  /** quanto ele compraria a mais nesta família na proporção da carteira; > 0 só quando compra menos */
  potencial_reais: number;
  total_cliente: number;
}

export const QK_CLIENTE_MIX = "cliente-painel-mix";

/**
 * Mix do cliente confrontado com a média da carteira. Uma linha por família,
 * inclusive as que ele nunca comprou. Só leitura.
 */
export function useMixCliente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_MIX, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<MixCliente[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_mix")
        .select("parceiro_id, familia, valor_cliente, pct_cliente, pct_carteira, gap_pp, nunca_comprou, potencial_reais, total_cliente")
        .eq("parceiro_id", parceiroId)
        .order("potencial_reais", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        parceiro_id: String(d.parceiro_id ?? ""),
        familia: String(d.familia ?? "—"),
        valor_cliente: Number(d.valor_cliente ?? 0),
        pct_cliente: Number(d.pct_cliente ?? 0),
        pct_carteira: Number(d.pct_carteira ?? 0),
        gap_pp: Number(d.gap_pp ?? 0),
        nunca_comprou: Boolean(d.nunca_comprou),
        potencial_reais: Number(d.potencial_reais ?? 0),
        total_cliente: Number(d.total_cliente ?? 0),
      }));
    },
  });
}
