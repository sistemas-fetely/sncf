/**
 * CONTA DO CLIENTE — camada de dados.
 *
 * Doutrina: DINHEIRO-CREDITA-CONTA-PEDIDO-DEBITA-SALDO. Dinheiro pertence ao
 * CLIENTE (CNPJ), não ao pedido. Nenhum hook aqui aceita pedido_id — é de propósito.
 *
 * As views e RPCs novas ainda não estão nos types gerados, por isso as chamadas
 * passam por `(supabase as any)` — mesmo padrão de useNavegacaoPortao.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContaClienteSaldo {
  parceiro_id: string;
  nome_fantasia: string | null;
  saldo: number;
  vencido_em_aberto: number;
  a_vencer: number;
  credito_futuro_boleto: number;
  ultima_movimentacao: string | null;
  lancamentos: number;
  qtd_titulos_abertos: number | null;
  faixa_1_7: number | null;
  faixa_8_30: number | null;
  faixa_31_60: number | null;
  faixa_60_mais: number | null;
  dias_atraso_max: number | null;
}

export interface ContaClienteLancamento {
  parceiro_id: string;
  data: string;
  tipo: string;
  sinal: number;
  valor: number;
  ref: string | null;
  pedido_ref: string | null;
  vencimento: string | null;
  vencido_aberto: boolean | null;
  titulo_id: string | null;
}

export interface ContaClienteFuro {
  furo: string;
  parceiro_id: string;
  cliente: string | null;
  ref: string | null;
  valor: number;
  detalhe: string | null;
}

export interface ContaClienteCobertura {
  cobertura_total: number;
  fonte1_saldo_disponivel: number;
  fonte3_limite_disponivel: number;
  limite_vigente: number;
  exposicao_em_aberto: number;
  vencido_em_aberto: number;
  sinal_analise_credito: boolean;
}

export const QK_CONTA_CLIENTE_SALDO = "conta-cliente-saldo";
export const QK_CONTA_CLIENTE_LANC = "conta-cliente-lancamentos";
export const QK_CONTA_CLIENTE_FUROS = "conta-cliente-furos";
export const QK_CONTA_CLIENTE_COBERTURA = "conta-cliente-cobertura";

/** Lista de saldos por cliente, ordenada por |saldo| desc. */
export function useContasClienteSaldo() {
  return useQuery({
    queryKey: [QK_CONTA_CLIENTE_SALDO],
    queryFn: async (): Promise<ContaClienteSaldo[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_saldo")
        .select("*");
      if (error) throw error;
      const linhas = (data ?? []) as ContaClienteSaldo[];
      return [...linhas].sort(
        (a, b) => Math.abs(Number(b.saldo ?? 0)) - Math.abs(Number(a.saldo ?? 0)),
      );
    },
  });
}

/** Extrato do cliente, data desc. */
export function useContaClienteLancamentos(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CONTA_CLIENTE_LANC, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ContaClienteLancamento[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_lancamentos")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContaClienteLancamento[];
    },
  });
}

/** Furos de trilha do cliente. Só aparece na tela quando houver. */
export function useContaClienteFuros(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CONTA_CLIENTE_FUROS, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ContaClienteFuro[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_cliente_furos")
        .select("*")
        .eq("parceiro_id", parceiroId);
      if (error) throw error;
      return (data ?? []) as ContaClienteFuro[];
    },
  });
}

/** Cobertura do cliente — SISTEMA SUGERE / HUMANO DECIDE. Somente leitura. */
export function useContaClienteCobertura(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CONTA_CLIENTE_COBERTURA, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ContaClienteCobertura | null> => {
      const { data, error } = await (supabase as any).rpc("fn_conta_cliente_cobertura", {
        p_parceiro_id: parceiroId,
      });
      if (error) throw error;
      return (data ?? null) as ContaClienteCobertura | null;
    },
  });
}

export type NivelProva = "conciliado" | "aguardando_extrato" | "declarado_humano";

export interface RegistrarRecebimentoInput {
  parceiro_id: string;
  valor: number;
  data: string;
  meio: string;
  chave?: string | null;
  pagador_nome?: string | null;
  pagador_documento?: string | null;
  observacao?: string | null;
}

export interface RegistrarRecebimentoResultado {
  ok: boolean;
  lancamento_id?: string;
  cliente?: string;
  valor?: number;
  meio?: string;
  nivel_prova?: NivelProva;
  saldo_conta_apos?: number;
  aviso?: string | null;
  erro?: string | null;
}

/**
 * Registra recebimento na conta do cliente. FAIL-LOUD: erro do banco sobe,
 * e `ok: false` também vira exceção para quem chama tratar com toast destrutivo.
 */
export function useRegistrarRecebimentoCliente() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegistrarRecebimentoInput): Promise<RegistrarRecebimentoResultado> => {
      const { data: sessao } = await supabase.auth.getUser();

      const { data, error } = await (supabase as any).rpc("registrar_recebimento_cliente", {
        p_parceiro_id: input.parceiro_id,
        p_valor: input.valor,
        p_data: input.data,
        p_meio: input.meio,
        p_chave: input.chave ?? null,
        p_pagador_nome: input.pagador_nome ?? null,
        p_pagador_documento: input.pagador_documento ?? null,
        p_observacao: input.observacao ?? null,
        p_user_id: sessao?.user?.id ?? null,
      });
      if (error) throw error;

      const res = (data ?? {}) as RegistrarRecebimentoResultado;
      if (!res.ok) throw new Error(res.erro || "O banco recusou o registro do recebimento.");
      return res;
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_SALDO] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_LANC, input.parceiro_id] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_FUROS, input.parceiro_id] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA, input.parceiro_id] });
    },
  });
}

export interface ClienteOpcao {
  id: string;
  nome: string;
  cnpj: string | null;
}

/** Busca de clientes para o select do dialog. */
export function useClientesBusca(termo: string) {
  const t = termo.trim();
  return useQuery({
    queryKey: ["conta-cliente-parceiros-busca", t],
    queryFn: async (): Promise<ClienteOpcao[]> => {
      let q = (supabase as any)
        .from("parceiros_comerciais")
        .select("id, nome_fantasia, razao_social, cnpj")
        .eq("ativo", true)
        .order("nome_fantasia")
        .limit(30);
      if (t) q = q.or(`nome_fantasia.ilike.%${t}%,razao_social.ilike.%${t}%,cnpj.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id,
        nome: p.nome_fantasia || p.razao_social || "(sem nome)",
        cnpj: p.cnpj ?? null,
      }));
    },
  });
}

/* ------------------------------------------------------------------------- *
 * ENTRADAS A RECONHECER — o que a varredura automática não reconheceu.
 * ------------------------------------------------------------------------- */

export interface EntradaReconhecer {
  id: string;
  data_transacao: string;
  valor: number;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  descricao: string;
  tipo_meio: string | null;
}

export const QK_ENTRADAS_RECONHECER = "conta-cliente-entradas-reconhecer";

/** Créditos bancários sem cliente atribuído. Fonte: movimentacoes_bancarias. */
export function useEntradasReconhecer() {
  return useQuery({
    queryKey: [QK_ENTRADAS_RECONHECER],
    queryFn: async (): Promise<EntradaReconhecer[]> => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, valor, contraparte_nome, contraparte_documento, descricao, tipo_meio")
        .eq("tipo", "credito")
        .eq("conciliado", false)
        .is("duplicada_de", null)
        .is("classe", null)
        .gte("data_transacao", "2026-09-05")
        .in("tipo_meio", ["pix", "transferencia", "boleto", "outro"])
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EntradaReconhecer[];
    },
  });
}

export interface AtribuirClienteResultado {
  ok: boolean;
  erro?: string | null;
  valor?: number;
  pagador_aprendido?: boolean;
}

/** Atribui uma entrada bancária a um cliente. FAIL-LOUD. */
export function useAtribuirClienteExtrato() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      movimentacao_id: string;
      parceiro_id: string;
    }): Promise<AtribuirClienteResultado> => {
      const { data: sessao } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any).rpc("fn_extrato_atribuir_cliente", {
        p_movimentacao_id: input.movimentacao_id,
        p_parceiro_id: input.parceiro_id,
        p_nota: null,
        p_user_id: sessao?.user?.id ?? null,
      });
      if (error) throw error;
      const res = (data ?? {}) as AtribuirClienteResultado;
      if (!res.ok) throw new Error(res.erro || "O banco recusou a atribuição.");
      return res;
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: [QK_ENTRADAS_RECONHECER] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_SALDO] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_LANC, input.parceiro_id] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA, input.parceiro_id] });
    },
  });
}

/* ------------------------------------------------------------------------- *
 * LIBERAR POR COBERTURA — caminho novo, convive com o portão antigo.
 * ------------------------------------------------------------------------- */

export interface LiberarCoberturaResultado {
  ok: boolean;
  coberto?: boolean;
  empenhado_saldo?: number;
  empenhado_limite?: number;
  ja_empenhado?: boolean;
  erro?: string | null;
  mensagem?: string | null;
  rota?: string | null;
}

/**
 * Empenha a cobertura do cliente para o pedido. `ok: false` com rota
 * `analise_credito` NÃO é erro — é rota, e quem chama mostra em âmbar.
 */
export function useLiberarPorCobertura() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      pedido_id: string;
      parceiro_id?: string | null;
    }): Promise<LiberarCoberturaResultado> => {
      const { data: sessao } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any).rpc("fn_pedido_liberar_por_cobertura", {
        p_pedido_id: input.pedido_id,
        p_user_id: sessao?.user?.id ?? null,
      });
      if (error) throw error;
      return (data ?? {}) as LiberarCoberturaResultado;
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_SALDO] });
      if (input.parceiro_id) {
        qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA, input.parceiro_id] });
        qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_LANC, input.parceiro_id] });
      }
    },
  });
}
