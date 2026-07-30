import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Tipos do submódulo de reembolso.
// Várias tabelas/RPCs ainda não constam no types.ts gerado — por isso o padrão
// `supabase.from("x" as never)` com cast apenas do RESULTADO.
// ---------------------------------------------------------------------------

export type EstadoSolicitacao =
  | "recebido"
  | "em_validacao"
  | "devolvido"
  | "aprovado"
  | "em_lote"
  | "pago"
  | "fechado"
  | "cancelado";

export interface Solicitacao {
  id: string;
  numero: string | null;
  vinculo_id: string;
  origem: string | null;
  estado: EstadoSolicitacao;
  data_recebimento: string | null;
  email_thread_ref: string | null;
  email_remetente: string | null;
  valor_solicitado: number | null;
  valor_aprovado: number | null;
  registrado_por: string | null;
  validado_por: string | null;
  aprovado_por: string | null;
  data_aprovacao: string | null;
  motivo_devolucao: string | null;
  justificativa_excecao_teto: string | null;
  ciclo_id: string | null;
  encaminhado_para_compras: boolean | null;
  pedido_compra_id: string | null;
  motivo_cancelamento: string | null;
  created_at: string | null;
}

export interface SolicitacaoLinha extends Solicitacao {
  nome_completo: string | null;
  bloqueantes: number;
  avisos: number;
}

export interface ItemSolicitacao {
  id: string;
  solicitacao_id: string;
  seq: number | null;
  categoria_id: string | null;
  plano_contas_id: string | null;
  data_despesa: string | null;
  descricao: string | null;
  evento_gerador: string | null;
  origem_trajeto: string | null;
  destino_trajeto: string | null;
  km: number | null;
  valor_solicitado: number | null;
  valor_aprovado: number | null;
  motivo_glosa: string | null;
  cnpj_emitente: string | null;
  tipo_documento: string | null;
  numero_comprovante: string | null;
  status_item: string | null;
  justificativa: string | null;
}

export interface Categoria {
  id: string;
  codigo: number;
  nome: string;
  ativo: boolean | null;
  ordem: number | null;
  exige_evento_gerador: boolean | null;
  exige_origem_destino: boolean | null;
  exige_justificativa_central: boolean | null;
  exige_ok_previo_diretoria: boolean | null;
  exige_cnpj_prestador: boolean | null;
  plano_contas_por_item: boolean | null;
}

export interface RegraCatalogo {
  codigo: string;
  rotulo: string | null;
  escopo: "solicitacao" | "item" | null;
  severidade: "bloqueante" | "aviso" | null;
  superavel: boolean | null;
  campo_cadastro: string | null;
  mensagem_resolucao: string | null;
  ordem: number | null;
  ativo: boolean | null;
}

export interface Apontamento {
  id: string;
  solicitacao_id: string;
  item_id: string | null;
  regra_codigo: string;
  severidade: "bloqueante" | "aviso";
  mensagem: string | null;
  valor_sugerido: number | null;
  superavel: boolean | null;
  resolvido: boolean | null;
  resolvido_em: string | null;
}

export interface ApontamentoComRegra extends Apontamento {
  rotulo: string | null;
  campo_cadastro: string | null;
  mensagem_resolucao: string | null;
  escopo: string | null;
  ordem: number | null;
}

export interface Ciclo {
  id: string;
  referencia: string;
  data_corte: string | null;
  data_pagamento_prevista: string | null;
  estado: "aberto" | "fechado" | "pago";
  total_aprovado: number | null;
  fechado_em: string | null;
}

export interface Lote {
  id: string;
  ciclo_id: string;
  vinculo_id: string;
  valor_total: number | null;
  chave_pix_snapshot: string | null;
  estado: "gerado" | "autorizado" | "pago";
  data_pagamento: string | null;
  comprovante_pagamento_path: string | null;
  cpr_id: string | null;
  nome_completo?: string | null;
}

export interface VinculoAtivo {
  vinculo_id: string;
  pessoa_id: string;
  nome_completo: string | null;
  tipo_vinculo: string | null;
  email_corporativo: string | null;
  falta_email: boolean | null;
  falta_pix: boolean | null;
  falta_gestor: boolean | null;
  falta_centro_custo: boolean | null;
  falta_previsao_contratual: boolean | null;
  pronto_para_reembolso: boolean | null;
}

export interface CentroCustoOpcao {
  id: string;
  codigo: string | null;
  nome: string | null;
}

export interface PlanoContasOpcao {
  id: string;
  codigo: string | null;
  nome: string | null;
}

export interface PessoaOpcao {
  id: string;
  nome_completo: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

function erroVisivel(err: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  toast.error(e?.message ?? String(err), {
    description: e?.details || e?.hint || undefined,
  });
}

export const CHAVES_REEMBOLSO = {
  solicitacoes: ["reembolso-solicitacoes"] as const,
  solicitacao: (id: string) => ["reembolso-solicitacao", id] as const,
  apontamentos: (id: string) => ["reembolso-apontamentos", id] as const,
  ciclos: ["reembolso-ciclos"] as const,
  lotes: (cicloId: string) => ["reembolso-lotes", cicloId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useSolicitacoes(filtroEstado?: EstadoSolicitacao | "todos") {
  return useQuery({
    queryKey: [...CHAVES_REEMBOLSO.solicitacoes, filtroEstado ?? "todos"],
    queryFn: async (): Promise<SolicitacaoLinha[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      let q = supabase
        .from("reembolso_solicitacoes" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (filtroEstado && filtroEstado !== "todos") {
        q = q.eq("estado", filtroEstado);
      }
      const { data, error } = await q;
      if (error) throw error;
      const solicitacoes = (data ?? []) as unknown as Solicitacao[];
      if (solicitacoes.length === 0) return [];

      const ids = solicitacoes.map((s) => s.id);
      const vinculoIds = Array.from(new Set(solicitacoes.map((s) => s.vinculo_id)));

      // Cast só do resultado: ainda não consta no types.ts gerado.
      const [apRes, vinRes] = await Promise.all([
        supabase
          .from("reembolso_apontamentos" as never)
          .select("solicitacao_id,severidade,resolvido")
          .in("solicitacao_id", ids),
        supabase
          .from("vw_reembolso_saneamento" as never)
          .select("vinculo_id,nome_completo")
          .in("vinculo_id", vinculoIds),
      ]);
      if (apRes.error) throw apRes.error;
      if (vinRes.error) throw vinRes.error;

      const apontamentos = (apRes.data ?? []) as unknown as Array<{
        solicitacao_id: string;
        severidade: string;
        resolvido: boolean | null;
      }>;
      const vinculos = (vinRes.data ?? []) as unknown as Array<{
        vinculo_id: string;
        nome_completo: string | null;
      }>;

      const nomePorVinculo = new Map(vinculos.map((v) => [v.vinculo_id, v.nome_completo]));
      const contagem = new Map<string, { bloqueantes: number; avisos: number }>();
      for (const a of apontamentos) {
        if (a.resolvido) continue;
        const c = contagem.get(a.solicitacao_id) ?? { bloqueantes: 0, avisos: 0 };
        if (a.severidade === "bloqueante") c.bloqueantes += 1;
        else c.avisos += 1;
        contagem.set(a.solicitacao_id, c);
      }

      return solicitacoes.map((s) => ({
        ...s,
        nome_completo: nomePorVinculo.get(s.vinculo_id) ?? null,
        bloqueantes: contagem.get(s.id)?.bloqueantes ?? 0,
        avisos: contagem.get(s.id)?.avisos ?? 0,
      }));
    },
  });
}

export function useSolicitacao(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: CHAVES_REEMBOLSO.solicitacao(id ?? ""),
    queryFn: async (): Promise<{
      solicitacao: Solicitacao;
      itens: ItemSolicitacao[];
      vinculo: VinculoAtivo | null;
    }> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_solicitacoes" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Solicitação não encontrada.");
      const solicitacao = data as unknown as Solicitacao;

      const [itensRes, vinRes] = await Promise.all([
        supabase
          .from("reembolso_itens" as never)
          .select("*")
          .eq("solicitacao_id", id)
          .order("seq"),
        supabase
          .from("vw_reembolso_saneamento" as never)
          .select("*")
          .eq("vinculo_id", solicitacao.vinculo_id)
          .maybeSingle(),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (vinRes.error) throw vinRes.error;

      return {
        solicitacao,
        itens: (itensRes.data ?? []) as unknown as ItemSolicitacao[],
        vinculo: (vinRes.data ?? null) as unknown as VinculoAtivo | null,
      };
    },
  });
}

export function useApontamentos(solicitacaoId: string | null) {
  return useQuery({
    enabled: !!solicitacaoId,
    queryKey: CHAVES_REEMBOLSO.apontamentos(solicitacaoId ?? ""),
    queryFn: async (): Promise<ApontamentoComRegra[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const [apRes, regrasRes] = await Promise.all([
        supabase
          .from("reembolso_apontamentos" as never)
          .select("*")
          .eq("solicitacao_id", solicitacaoId),
        supabase.from("reembolso_regras_catalogo" as never).select("*"),
      ]);
      if (apRes.error) throw apRes.error;
      if (regrasRes.error) throw regrasRes.error;

      const apontamentos = (apRes.data ?? []) as unknown as Apontamento[];
      const regras = (regrasRes.data ?? []) as unknown as RegraCatalogo[];
      const porCodigo = new Map(regras.map((r) => [r.codigo, r]));

      return apontamentos
        .filter((a) => !a.resolvido)
        .map((a) => {
          const r = porCodigo.get(a.regra_codigo);
          return {
            ...a,
            rotulo: r?.rotulo ?? null,
            campo_cadastro: r?.campo_cadastro ?? null,
            mensagem_resolucao: r?.mensagem_resolucao ?? null,
            escopo: r?.escopo ?? null,
            ordem: r?.ordem ?? null,
          };
        })
        .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
    },
  });
}

export function useCategorias() {
  return useQuery({
    queryKey: ["reembolso-categorias"],
    queryFn: async (): Promise<Categoria[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_categorias" as never)
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Categoria[];
    },
  });
}

export function useRegrasCatalogo() {
  return useQuery({
    queryKey: ["reembolso-regras-catalogo"],
    queryFn: async (): Promise<RegraCatalogo[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_regras_catalogo" as never)
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as RegraCatalogo[];
    },
  });
}

export function useCiclos() {
  return useQuery({
    queryKey: CHAVES_REEMBOLSO.ciclos,
    queryFn: async (): Promise<Array<Ciclo & { lotes: number }>> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_ciclos" as never)
        .select("*")
        .order("referencia", { ascending: false });
      if (error) throw error;
      const ciclos = (data ?? []) as unknown as Ciclo[];
      if (ciclos.length === 0) return [];

      const { data: lotesData, error: lotesErr } = await supabase
        .from("reembolso_lotes" as never)
        .select("id,ciclo_id")
        .in("ciclo_id", ciclos.map((c) => c.id));
      if (lotesErr) throw lotesErr;
      const lotes = (lotesData ?? []) as unknown as Array<{ id: string; ciclo_id: string }>;
      const contagem = new Map<string, number>();
      for (const l of lotes) contagem.set(l.ciclo_id, (contagem.get(l.ciclo_id) ?? 0) + 1);

      return ciclos.map((c) => ({ ...c, lotes: contagem.get(c.id) ?? 0 }));
    },
  });
}

export function useLotes(cicloId: string | null) {
  return useQuery({
    enabled: !!cicloId,
    queryKey: CHAVES_REEMBOLSO.lotes(cicloId ?? ""),
    queryFn: async (): Promise<Lote[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_lotes" as never)
        .select("*")
        .eq("ciclo_id", cicloId);
      if (error) throw error;
      const lotes = (data ?? []) as unknown as Lote[];
      if (lotes.length === 0) return [];

      const { data: vinData, error: vinErr } = await supabase
        .from("vw_reembolso_saneamento" as never)
        .select("vinculo_id,nome_completo")
        .in("vinculo_id", Array.from(new Set(lotes.map((l) => l.vinculo_id))));
      if (vinErr) throw vinErr;
      const vinculos = (vinData ?? []) as unknown as Array<{
        vinculo_id: string;
        nome_completo: string | null;
      }>;
      const nomes = new Map(vinculos.map((v) => [v.vinculo_id, v.nome_completo]));
      return lotes
        .map((l) => ({ ...l, nome_completo: nomes.get(l.vinculo_id) ?? null }))
        .sort((a, b) => (a.nome_completo ?? "").localeCompare(b.nome_completo ?? ""));
    },
  });
}

export function useSolicitacoesDoLote(loteId: string | null) {
  return useQuery({
    enabled: !!loteId,
    queryKey: ["reembolso-lote-itens", loteId],
    queryFn: async (): Promise<
      Array<{ id: string; numero: string | null; valor_aprovado: number | null; nome_completo: string | null }>
    > => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("reembolso_lote_itens" as never)
        .select("solicitacao_id")
        .eq("lote_id", loteId);
      if (error) throw error;
      const vinculos = (data ?? []) as unknown as Array<{ solicitacao_id: string }>;
      if (vinculos.length === 0) return [];

      const { data: solData, error: solErr } = await supabase
        .from("reembolso_solicitacoes" as never)
        .select("id,numero,valor_aprovado,vinculo_id")
        .in("id", vinculos.map((v) => v.solicitacao_id));
      if (solErr) throw solErr;
      const sols = (solData ?? []) as unknown as Array<{
        id: string;
        numero: string | null;
        valor_aprovado: number | null;
        vinculo_id: string;
      }>;

      const { data: vinData, error: vinErr } = await supabase
        .from("vw_reembolso_saneamento" as never)
        .select("vinculo_id,nome_completo")
        .in("vinculo_id", Array.from(new Set(sols.map((s) => s.vinculo_id))));
      if (vinErr) throw vinErr;
      const nomes = new Map(
        ((vinData ?? []) as unknown as Array<{ vinculo_id: string; nome_completo: string | null }>).map(
          (v) => [v.vinculo_id, v.nome_completo],
        ),
      );

      return sols.map((s) => ({
        id: s.id,
        numero: s.numero,
        valor_aprovado: s.valor_aprovado,
        nome_completo: nomes.get(s.vinculo_id) ?? null,
      }));
    },
  });
}

export function useVinculosAtivos() {
  return useQuery({
    queryKey: ["reembolso-vinculos-ativos"],
    queryFn: async (): Promise<VinculoAtivo[]> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase
        .from("vw_reembolso_saneamento" as never)
        .select("*")
        .order("nome_completo");
      if (error) throw error;
      return (data ?? []) as unknown as VinculoAtivo[];
    },
  });
}

export function usePessoas() {
  return useQuery({
    queryKey: ["reembolso-pessoas"],
    queryFn: async (): Promise<PessoaOpcao[]> => {
      const { data, error } = await supabase
        .from("pessoas")
        .select("id,nome_completo")
        .order("nome_completo");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCentrosCusto() {
  return useQuery({
    queryKey: ["reembolso-centros-custo"],
    queryFn: async (): Promise<CentroCustoOpcao[]> => {
      const { data, error } = await supabase
        .from("centros_custo")
        .select("id,codigo,nome")
        .eq("ativo", true)
        .order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlanoContas() {
  return useQuery({
    queryKey: ["reembolso-plano-contas"],
    queryFn: async (): Promise<PlanoContasOpcao[]> => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id,codigo,nome")
        .eq("ativo", true)
        .order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCicloDaData(dataAprovacao: string) {
  return useQuery({
    queryKey: ["reembolso-ciclo-referencia", dataAprovacao],
    queryFn: async (): Promise<string | null> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "fn_reembolso_ciclo_referencia" as never,
        { p_data_aprovacao: dataAprovacao } as never,
      );
      if (error) throw error;
      return (data ?? null) as unknown as string | null;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface ResultadoLancamento {
  ok?: boolean;
  id: string;
  numero: string;
  itens?: number;
  valor_solicitado?: number;
  apontamentos?: number;
  bloqueantes?: number;
}

export function useLancarSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Json): Promise<ResultadoLancamento> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_lancar_solicitacao" as never,
        { p: payload } as never,
      );
      if (error) throw error;
      return data as unknown as ResultadoLancamento;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes });
    },
    onError: erroVisivel,
  });
}

export interface ResultadoResolucao {
  ok?: boolean;
  regra?: string;
  campo?: string;
  rateios_criados?: number;
  apontamentos_restantes?: number;
  bloqueantes?: number;
}

export function useResolverCadastro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      solicitacaoId: string;
      regraCodigo: string;
      valor: string;
    }): Promise<ResultadoResolucao> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_resolver_cadastro" as never,
        {
          p_solicitacao_id: args.solicitacaoId,
          p_regra_codigo: args.regraCodigo,
          p_valor: args.valor,
        } as never,
      );
      if (error) throw error;
      return data as unknown as ResultadoResolucao;
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.apontamentos(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacao(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
        qc.invalidateQueries({ queryKey: ["reembolso-saneamento"] }),
        qc.invalidateQueries({ queryKey: ["reembolso-vinculos-ativos"] }),
      ]);
    },
    onError: erroVisivel,
  });
}

export function useGlosarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      solicitacaoId: string;
      itemId: string;
      valorAprovado: number;
      motivo: string;
    }): Promise<Json> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_glosar_item" as never,
        {
          p_item_id: args.itemId,
          p_valor_aprovado: args.valorAprovado,
          p_motivo: args.motivo,
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacao(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.apontamentos(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
      ]);
    },
    onError: erroVisivel,
  });
}

export interface ResultadoAprovacao {
  ok?: boolean;
  numero?: string;
  valor_aprovado?: number;
  ciclo?: string;
  destaque_relatorio?: boolean;
  excecao_aplicada?: boolean;
}

export function useAprovar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      solicitacaoId: string;
      justificativa: string | null;
    }): Promise<ResultadoAprovacao> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_aprovar" as never,
        {
          p_solicitacao_id: args.solicitacaoId,
          p_justificativa_excecao: args.justificativa,
        } as never,
      );
      if (error) throw error;
      return data as unknown as ResultadoAprovacao;
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacao(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.apontamentos(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.ciclos }),
      ]);
    },
    onError: erroVisivel,
  });
}

export function useDevolver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { solicitacaoId: string; motivo: string }): Promise<Json> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_devolver" as never,
        { p_solicitacao_id: args.solicitacaoId, p_motivo: args.motivo } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacao(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
      ]);
    },
    onError: erroVisivel,
  });
}

export function useReabrir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { solicitacaoId: string }): Promise<Json> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_reabrir" as never,
        { p_solicitacao_id: args.solicitacaoId } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacao(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.apontamentos(vars.solicitacaoId) }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
      ]);
    },
    onError: erroVisivel,
  });
}

export interface ResultadoFechamento {
  ok?: boolean;
  ciclo?: string;
  lotes?: number;
  total?: number;
  adiados_sem_pix?: number;
  adiados_nomes?: string[] | string | null;
  ciclo_destino_adiados?: string | null;
}

export function useFecharCiclo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { referencia: string }): Promise<ResultadoFechamento> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_fechar_ciclo" as never,
        { p_referencia: args.referencia } as never,
      );
      if (error) throw error;
      return data as unknown as ResultadoFechamento;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.ciclos }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
        qc.invalidateQueries({ queryKey: ["reembolso-lotes"] }),
      ]);
    },
    onError: erroVisivel,
  });
}

export interface ResultadoPagamento {
  ok?: boolean;
  valor?: number;
  reembolsos?: number;
  data?: string;
  cpr_id?: string;
  cpr_status?: string;
}

export function useRegistrarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      loteId: string;
      dataPagamento: string;
      comprovantePath: string | null;
    }): Promise<ResultadoPagamento> => {
      // Cast só do resultado: ainda não consta no types.ts gerado.
      const { data, error } = await supabase.rpc(
        "reembolso_registrar_pagamento" as never,
        {
          p_lote_id: args.loteId,
          p_data_pagamento: args.dataPagamento,
          p_comprovante_path: args.comprovantePath,
        } as never,
      );
      if (error) throw error;
      return data as unknown as ResultadoPagamento;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["reembolso-lotes"] }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.ciclos }),
        qc.invalidateQueries({ queryKey: CHAVES_REEMBOLSO.solicitacoes }),
      ]);
    },
    onError: erroVisivel,
  });
}

// ---------------------------------------------------------------------------
// Utilidades de apresentação
// ---------------------------------------------------------------------------

export function mascararPix(chave: string | null | undefined): string {
  if (!chave) return "—";
  const limpa = String(chave);
  if (limpa.length <= 4) return "••••";
  return `••••${limpa.slice(-4)}`;
}

export function formatarBRL(valor: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(valor ?? 0),
  );
}

export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export const ROTULO_ESTADO: Record<string, string> = {
  recebido: "Recebido",
  em_validacao: "Em validação",
  devolvido: "Devolvido",
  aprovado: "Aprovado",
  em_lote: "Em lote",
  pago: "Pago",
  fechado: "Fechado",
  cancelado: "Cancelado",
};
