import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useListaPaginada, chamarLista, type ParamsLista, type FiltroLista, type AgregadoLista } from "@/lib/lista/useListaPaginada";
import { recortarSegmentos } from "@/lib/lista/segmentos";

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
  /**
   * PIX: `link_pagamento` guarda o código copia-e-cola (EMV), não uma URL.
   * `pix_token` é o token da página pública `/pagar/:token` (QR + copia-e-cola
   * + valor) — é ela que se copia para o cliente.
   */
  pix_token: string | null;
  data_entrega_prevista: string | null;
  meta_original: string | null;
  meta_provisoria: boolean | null;
  nf_numero: string | null;
  nf_chave: string | null;
  /**
   * MECANISMO-ANTES-DE-URL: `nf_id` e o que a Mesa usa para baixar NF, via edge
   * function `nf-download` (resolve link fresco no Bling pelo servidor).
   * `nf_pdf_url`/`nf_xml_url` sao CACHE de link assinado (~48h) e nao servem para
   * abrir no navegador do usuario — ficam so como diagnostico.
   */
  nf_id: string | null;
  nf_serie: string | null;
  nf_pdf_url: string | null;

  nf_xml_url: string | null;
  tem_pdf: boolean | null;
  tem_xml: boolean | null;
  boletos_qtd: number | null;
  boletos_valor_aberto: number | null;
  comprovantes_qtd: number | null;
  comprovante_status: string | null;
  solicitacoes_abertas: number | null;
  /**
   * CONDICAO-FORMA-VEM-DA-VIEW: `condicao_solicitada`, `forma_pagamento_id` e
   * `forma_pagamento_nome` já vêm de `vw_mesa_comercial` (join com `formas_pagamento`).
   * A condição é o texto informativo; a forma é a dimensão que agrupa e filtra.
   * `pedidos.tipo_pagamento` é coluna morta — não usar.
   */
  condicao_solicitada: string | null;
  forma_pagamento_id: string | null;
  forma_pagamento_nome: string | null;
  /** HISTORICO-DO-CLIENTE-VEM-DA-VIEW: recriado em `vw_mesa_comercial`, sem segundo fetch. */
  eh_primeira_compra: boolean | null;
  cliente_pedidos_faturados: number | null;
  cliente_valor_faturado: number | null;
  cliente_primeira_compra: string | null;
  cliente_ultima_compra: string | null;
  cliente_dias_sem_comprar: number | null;
  cliente_ticket_medio: number | null;
}

export const MESA_QUERY_KEY = ["mesa-comercial"] as const;

/** Carteira B2B ativa completa (~215 pedidos). A view e lenta (~3s) por design atual. */
export function useMesaComercial(params: Omit<ParamsLista, "relacao">, enabled = true) {
  const base: ParamsLista = { ...params, relacao: "vw_mesa_comercial" };
  const temperaturas = ["quente", "morno", "frio", "nao_cobrar"];
  const filtroTemperatura = (chave: string): FiltroLista => chave === "restantes"
    ? { op: "or", v: [{ c: "temperatura_sistema", op: "nin", v: temperaturas }, { c: "temperatura_sistema", op: "is_null" }] }
    : { c: "temperatura_sistema", op: "eq", v: chave };
  const chaves = [...temperaturas, "restantes"];
  const resumo = useListaPaginada<MesaComercialRow>({ ...base, tamanho: 1, pagina: 1,
    agregados: [...(params.agregados ?? []), ...chaves.map((chave): AgregadoLista => ({ id: "ordem_" + chave, fn: "count", onde: [filtroTemperatura(chave)] }))],
  }, { enabled });
  const pagina = params.pagina ?? 1;
  const tamanho = params.tamanho ?? 20;
  const linhas = useQuery({
    queryKey: ["lista", base.relacao, "pagina-temperatura", base, resumo.data?.agregados],
    enabled: enabled && !!resumo.data,
    queryFn: async () => {
      const recortes = recortarSegmentos(chaves.map((chave) => ({ chave, total: Number(resumo.data?.agregados["ordem_" + chave] ?? 0) })), pagina, tamanho);
      const resultado: MesaComercialRow[] = [];
      for (const recorte of recortes) {
        const filtros = [...(params.filtros ?? []), filtroTemperatura(recorte.chave)];
        const primeiro = Math.floor(recorte.inicio / tamanho) + 1;
        const deslocamento = recorte.inicio % tamanho;
        const lista = await chamarLista<MesaComercialRow>({ ...base, agregados: [], facetas: [], filtros,
          ordem: [{ c: "valor", dir: "desc" }, { c: "dias_desde_pedido", dir: "desc" }], pagina: primeiro, tamanho });
        let itens = lista.linhas.slice(deslocamento, deslocamento + recorte.quantidade);
        if (itens.length < recorte.quantidade) {
          const proxima = await chamarLista<MesaComercialRow>({ ...base, agregados: [], facetas: [], filtros,
            ordem: [{ c: "valor", dir: "desc" }, { c: "dias_desde_pedido", dir: "desc" }], pagina: primeiro + 1, tamanho });
          itens = [...itens, ...proxima.linhas.slice(0, recorte.quantidade - itens.length)];
        }
        resultado.push(...itens);
      }
      return resultado;
    },
  });
  return { ...linhas, total: resumo.data?.total ?? 0, agregados: resumo.data?.agregados,
    isLoading: resumo.isLoading || (enabled && linhas.isLoading), isFetching: resumo.isFetching || linhas.isFetching,
    error: resumo.error ?? linhas.error, isError: resumo.isError || linhas.isError,
    refetch: async () => { const r = await resumo.refetch(); if (r.error) throw r.error; return linhas.refetch(); },
  };
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

/**
 * EIXO-2 (estado do pagamento): DIMENSAO-VIA-TABELA, somente leitura.
 * Rótulos e cores vêm de `pagamento_estado_dim`, nunca de constante no código.
 */
export function usePagamentoEstadoOpcoes() {
  return useQuery({
    queryKey: ["pagamento-estado-opcoes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StatusComercialOpcao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pagamento_estado_dim")
        .select("slug, rotulo, cor, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatusComercialOpcao[];
    },
  });
}

/** Estados do eixo 2 que são TAREFA do comercial, não etiqueta. */
export const PAGAMENTO_ESTADO_TAREFA = new Set(["gerar_link", "link_vencido"]);

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
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: MESA_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: ["lista", "vw_mesa_comercial"] });
    },
  });
}

/**
 * Vendedor do usuário logado. CADEIA-CANONICA: `vendedores` não tem
 * `usuario_id` — o caminho é usuario → vinculos.usuario_id → vinculos.pessoa_id
 * → vendedores.pessoa_id. Fonte única: quem precisar do vendedor do usuário usa
 * este hook. Sem vendedor vinculado, devolve null — NUNCA um fallback silencioso.
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
      const { data: vinculos, error: vErr } = await (supabase as any)
        .from("vinculos")
        .select("pessoa_id")
        .eq("usuario_id", user.id);
      if (vErr) throw vErr;

      const pessoaIds = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...new Set((vinculos ?? []).map((v: any) => v.pessoa_id).filter(Boolean)),
      ];
      if (pessoaIds.length === 0) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendedores")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .in("pessoa_id", pessoaIds)
        .limit(1);
      if (error) throw error;
      if (data?.[0]) return { id: data[0].id, nome: data[0].nome_exibicao };

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
