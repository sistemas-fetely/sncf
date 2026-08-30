import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * FONTE-UNICA DA MESA COMERCIAL: tudo nesta tela le `vw_mesa_comercial`.
 * DIMENSAO-VIA-TABELA: a lista de status vem de `oportunidade_status_comercial`,
 * nunca de constante no codigo — o Comercial edita a dimensao.
 */

export type FaseMesa = "oportunidade" | "pos_faturamento" | "em_andamento";
/** Filtro de topo: 2 grupos só. `fase_mesa` continua existindo para as ações. */
export type GrupoMesa = "oportunidade" | "em_andamento";

export interface MesaComercialRow {
  pedido_id: string;
  id_externo: string | null;
  canal: string | null;
  data_pedido: string | null;
  dias_desde_pedido: number | null;
  valor: number | null;
  parceiro_id: string | null;
  cliente: string | null;
  apelido: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  estagio: string | null;
  fase_mesa: FaseMesa | null;
  grupo_mesa: GrupoMesa | null;
  /** EIXO-2 READ-ONLY: derivado na view, nunca editado pela tela. */
  pagamento_estado_slug: string | null;
  status_comercial_slug: string | null;
  status_comercial_rotulo: string | null;
  status_comercial_cor: string | null;
  status_comercial_ordem: number | null;
  status_comercial_em: string | null;
  status_comercial_por: string | null;
  status_comercial_motivo: string | null;
  temperatura_sistema: string | null;
  temperatura_score: number | null;
  bloqueio_rotulo: string | null;
  situacao_financeira: string | null;
  alerta_operacional: string | null;
  link_pagamento: string | null;
  data_entrega_prevista: string | null;
  meta_original: string | null;
  meta_provisoria: boolean | null;
  nf_numero: string | null;
  nf_chave: string | null;
  nf_pdf_url: string | null;
  nf_xml_url: string | null;
  tem_pdf: boolean | null;
  tem_xml: boolean | null;
  boletos_qtd: number | null;
  boletos_valor_aberto: number | null;
  comprovantes_qtd: number | null;
  comprovante_status: string | null;
  solicitacoes_abertas: number | null;
}

export const MESA_QUERY_KEY = ["mesa-comercial"] as const;

/** Carteira B2B ativa completa (~215 pedidos). A view e lenta (~3s) por design atual. */
export function useMesaComercial() {
  return useQuery({
    queryKey: MESA_QUERY_KEY,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<MesaComercialRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_mesa_comercial")
        .select("*")
        .order("dias_desde_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MesaComercialRow[];
    },
  });
}

export interface StatusComercialOpcao {
  slug: string;
  rotulo: string;
  cor: string | null;
  ordem: number | null;
}

/** DIMENSAO-VIA-TABELA: opcoes ativas, sempre do banco. */
export function useStatusComercialOpcoes() {
  return useQuery({
    queryKey: ["status-comercial-opcoes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StatusComercialOpcao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("oportunidade_status_comercial")
        .select("slug, rotulo, cor, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatusComercialOpcao[];
    },
  });
}

export interface StatusLogRow {
  id: string;
  de_slug: string | null;
  para_slug: string | null;
  motivo: string | null;
  definido_em: string | null;
  definido_por: string | null;
  definido_por_nome: string | null;
}

/** Historico do status manual, com o nome de quem definiu. */
export function useStatusComercialLog(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["status-comercial-log", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<StatusLogRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("oportunidade_status_log")
        .select("id, de_slug, para_slug, motivo, definido_em, definido_por")
        .eq("pedido_id", pedidoId)
        .order("definido_em", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      const ids = [...new Set(rows.map((r) => r.definido_por).filter(Boolean))];
      const nomes = new Map<string, string>();
      if (ids.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: perfis, error: pErr } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        if (pErr) throw pErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (perfis ?? []).forEach((p: any) => nomes.set(p.user_id, p.full_name));
      }
      return rows.map((r) => ({
        ...r,
        definido_por_nome: r.definido_por ? nomes.get(r.definido_por) ?? null : null,
      })) as StatusLogRow[];
    },
  });
}

/**
 * Grava o status manual. FAIL-LOUD: cada passo com await, erro sobe,
 * otimista revertido pelo React Query e toast explica ao usuario.
 */
export function useDefinirStatusComercial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pedidoId: string;
      deSlug: string | null;
      paraSlug: string;
      motivo?: string | null;
    }) => {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user) throw new Error("Sessão expirada — entre novamente para mudar o status.");

      const agora = new Date().toISOString();
      const motivo = input.motivo?.trim() || null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supabase as any)
        .from("pedidos")
        .update({
          status_comercial_slug: input.paraSlug,
          status_comercial_em: agora,
          status_comercial_por: user.id,
          status_comercial_motivo: motivo,
        })
        .eq("id", input.pedidoId);
      if (upErr) throw upErr;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: logErr } = await (supabase as any)
        .from("oportunidade_status_log")
        .insert({
          pedido_id: input.pedidoId,
          de_slug: input.deSlug,
          para_slug: input.paraSlug,
          motivo,
          definido_por: user.id,
          definido_em: agora,
        });
      if (logErr) throw logErr;

      return true;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: MESA_QUERY_KEY });
      const anterior = qc.getQueryData<MesaComercialRow[]>(MESA_QUERY_KEY);
      if (anterior) {
        qc.setQueryData<MesaComercialRow[]>(
          MESA_QUERY_KEY,
          anterior.map((r) =>
            r.pedido_id === input.pedidoId
              ? { ...r, status_comercial_slug: input.paraSlug }
              : r,
          ),
        );
      }
      return { anterior };
    },
    onError: (e: Error, _input, ctx) => {
      // Rollback do otimista antes de avisar — a tela nunca mente.
      if (ctx?.anterior) qc.setQueryData(MESA_QUERY_KEY, ctx.anterior);
      toast.error("Não foi possível mudar o status comercial", { description: e.message });
    },
    onSuccess: (_d, input) => {
      toast.success("Status comercial atualizado");
      qc.invalidateQueries({ queryKey: ["status-comercial-log", input.pedidoId] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MESA_QUERY_KEY });
    },
  });
}

/**
 * Vendedor vinculado ao usuario logado. Sem tabela de vinculo direto: casamos
 * pelo nome do perfil e, na falta dele, pelo e-mail de contato do vendedor.
 * Sem vendedor, o toggle "Meus pedidos" nasce desligado (e explica o motivo).
 */
export function useVendedorAtual() {
  return useQuery({
    queryKey: ["mesa-vendedor-atual"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; nome: string } | null> => {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: perfil, error: pErr } = await (supabase as any)
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pErr) throw pErr;

      const nome = (perfil?.full_name ?? "").trim();
      if (nome) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("vendedores")
          .select("id, nome_exibicao")
          .eq("ativo", true)
          .ilike("nome_exibicao", nome)
          .limit(1);
        if (error) throw error;
        if (data?.[0]) return { id: data[0].id, nome: data[0].nome_exibicao };
      }

      if (user.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("vendedores")
          .select("id, nome_exibicao")
          .eq("ativo", true)
          .ilike("email_contato", user.email)
          .limit(1);
        if (error) throw error;
        if (data?.[0]) return { id: data[0].id, nome: data[0].nome_exibicao };
      }

      return null;
    },
  });
}

/** Cor da dimensao -> token semantico. Nunca cor crua de Tailwind. */
export const COR_STATUS_CLASSE: Record<string, string> = {
  vermelho: "border-destructive/50 text-destructive",
  ambar: "border-warning/50 text-warning",
  amarelo: "border-warning/50 text-warning",
  azul: "border-primary/50 text-primary",
  verde: "border-success/50 text-success",
  cinza: "border-muted-foreground/40 text-muted-foreground",
};
