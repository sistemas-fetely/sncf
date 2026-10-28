import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import {
  EVENTO_ROTEADO,
  type AguardandoNfMesa, type CaixaSugerida, type DadosImpressao, type DocumentoMesa, type EtapaMesa, type CancelamentoMesa, type EventoMesa, type IdentidadesPedidoMesa, type ItemChecklistEmbalagem, type ItemConferido, type ItemPedidoMesa,
  type ImagemProdutoMesa, type ModalEntrega, type ModalRegra, type PedidoMesa, type VdModoModal, type PesoEstimado, type ModalSugerido, type ExecutorMesa,
} from "./tipos";

/**
 * POR-QUE-UM-CLIENTE-SEM-TIPOS: a F0 desta frente criou `b2c_modal_entrega`,
 * `b2c_modal_regra` e as quatro `fn_mesa_sp_*` direto no banco, mas
 * `src/integrations/supabase/types.ts` (arquivo gerado) ainda não foi regerado —
 * e regerar não é escopo desta PR. Sem isso o cliente tipado recusa os nomes.
 *
 * Em vez de espalhar `as any` por cada chamada, o furo mora AQUI, em um único
 * ponto nomeado: um `SupabaseClient` sem o genérico `Database`. O builder
 * continua tipado; o que se perde é só a checagem do nome da tabela. Toda linha
 * que sai daqui é imediatamente estreitada nos tipos de `tipos.ts`.
 *
 * REMOVER quando types.ts for regerado: trocar `supabaseMesa` por `supabase`.
 */
const supabaseMesa = supabase as unknown as SupabaseClient;

export const CHAVE_PEDIDOS_MESA = ["mesa-sp", "pedidos"] as const;
export const CHAVE_EVENTOS_MESA = ["mesa-sp", "eventos"] as const;
export const CHAVE_IDENTIDADES_MESA = ["mesa-sp", "identidades"] as const;
export const CHAVE_MARCACOES_MESA = ["mesa-sp", "marcacoes-embalagem"] as const;
export const CHAVE_CANCELAMENTOS_MESA = ["mesa-sp", "cancelamentos"] as const;
export const CHAVE_DOCUMENTOS_MESA = ["mesa-sp", "documentos"] as const;
export const CHAVE_AGUARDANDO_NF_MESA = ["mesa-sp", "aguardando-nf"] as const;

/**
 * Mensagem de erro do Postgres/PostgREST sem engolir nada (FAIL-LOUD).
 * `formatError` é a doutrina da casa: o erro do PostgREST não é `Error` de
 * verdade em runtime, e `String(e)` nele devolve "[object Object]".
 */
const mensagemErro = formatError;

/**
 * Pedidos da Mesa SP com a etapa JÁ DERIVADA no banco (`vw_mesa_sp_quadro`).
 * Fonte única da etapa: a tela não calcula estação nenhuma.
 */
export function usePedidosMesaSp() {
  return useQuery({
    queryKey: CHAVE_PEDIDOS_MESA,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<PedidoMesa[]> => {
      const { data, error } = await supabaseMesa
        .from("vw_mesa_sp_quadro")
        .select(
          "pedido_id, id_externo, canal, estagio, valor_liquido, recebido_em, endereco_entrega, cliente_nome, cd_codigo, cd_rotulo, etapa, etapa_ordem, etapa_rotulo, limite_min, entrou_em, minutos_parado, estourou_limite",
        )
        .order("recebido_em", { ascending: true });
      if (error) throw new Error(`ler quadro da mesa: ${mensagemErro(error)}`);
      return ((data ?? []) as (Omit<PedidoMesa, "id"> & { pedido_id: string })[]).map(({ pedido_id, ...p }) => ({
        ...p,
        id: pedido_id,
        valor_liquido: Number(p.valor_liquido ?? 0),
        minutos_parado: p.minutos_parado == null ? null : Number(p.minutos_parado),
        estourou_limite: p.estourou_limite === true,
      }));
    },
  });
}

/** Etapas ativas por canal (`mesa_sp_etapa`) — colunas do quadro e rótulos. */
export function useEtapasMesaSp() {
  return useQuery({
    queryKey: ["mesa-sp", "etapas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EtapaMesa[]> => {
      const { data, error } = await supabaseMesa
        .from("mesa_sp_etapa")
        .select("canal, codigo, ordem, rotulo, limite_min, coluna_quadro, ordem_quadro")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw new Error(`ler etapas da mesa: ${mensagemErro(error)}`);
      return (data ?? []) as EtapaMesa[];
    },
  });
}

/** Eventos `mesa_*` (+ o roteamento) dos pedidos listados — alimenta trilha e sub-estação. */
export function useEventosMesaSp(pedidoIds: string[]) {
  const chave = [...pedidoIds].sort().join(",");
  return useQuery({
    queryKey: [...CHAVE_EVENTOS_MESA, chave],
    enabled: pedidoIds.length > 0,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<EventoMesa[]> => {
      const { data, error } = await supabaseMesa
        .from("pedido_eventos")
        .select("id, pedido_id, tipo_evento, descricao, criado_em, metadata")
        .in("pedido_id", pedidoIds)
        .or(`tipo_evento.like.mesa_%,tipo_evento.eq.${EVENTO_ROTEADO}`)
        .order("criado_em", { ascending: true });
      if (error) throw new Error(`ler eventos da mesa: ${mensagemErro(error)}`);
      return (data ?? []) as EventoMesa[];
    },
  });
}

/** Identidades externas dos pedidos listados, lidas em uma única consulta à visão B2C. */
export function useIdentidadesMesaSp(pedidoIds: string[]) {
  const chave = [...pedidoIds].sort().join(",");
  return useQuery({
    queryKey: [...CHAVE_IDENTIDADES_MESA, chave],
    meta: { pesada: true },
    enabled: pedidoIds.length > 0,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<Map<string, IdentidadesPedidoMesa>> => {
      const { data, error } = await supabaseMesa
        .from("vw_gestao_b2c_pedido")
        .select("pedido_id, order_name, bling_pedido_numero, nf_refs")
        .in("pedido_id", pedidoIds);
      if (error) throw new Error(`ler identidades dos pedidos: ${mensagemErro(error)}`);

      const mapa = new Map<string, IdentidadesPedidoMesa>();
      for (const linha of (data ?? []) as IdentidadesPedidoMesa[]) {
        if (linha.pedido_id) mapa.set(linha.pedido_id, linha);
      }
      return mapa;
    },
  });
}

/**
 * Picking list do pedido: itens + EAN.
 * O EAN não mora em `pedido_itens` — vem do espelho `sncf_produtos` pelo SKU,
 * que é a fonte canônica de cadastro (cobertura hoje: 100% dos SKUs do B2C).
 * Foto de produto NÃO mora aqui: ela vem de `vw_produto_imagem` pelo hook
 * `useImagensProdutosMesa` (a view resolve variante → produto → galeria), e
 * entra na conferência como conferência visual, nunca como dado do item.
 */
export function useItensPedidoMesa(pedidoId: string | null) {
  return useQuery({
    queryKey: ["mesa-sp", "itens", pedidoId],
    enabled: !!pedidoId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ItemPedidoMesa[]> => {
      const { data, error } = await supabaseMesa
        .from("pedido_itens")
        .select("id, sku, descricao, quantidade, ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: true });
      if (error) throw new Error(`ler itens do pedido: ${mensagemErro(error)}`);

      const itens = (data ?? []) as { id: string; sku: string | null; descricao: string; quantidade: number }[];
      const skus = [...new Set(itens.map((i) => i.sku).filter((s): s is string => !!s))];

      const eanPorSku = new Map<string, string>();
      const codPorSku = new Map<string, string>();
      if (skus.length > 0) {
        const { data: prods, error: eProd } = await supabaseMesa
          .from("sncf_produtos")
          .select("sku, ean, cod_cadastro")
          .in("sku", skus);
        if (eProd) throw new Error(`ler EAN dos produtos: ${mensagemErro(eProd)}`);
        for (const p of (prods ?? []) as { sku: string; ean: string | null; cod_cadastro: string | null }[]) {
          if (p.cod_cadastro && p.cod_cadastro.trim() !== "") codPorSku.set(p.sku, p.cod_cadastro.trim());
          if (p.ean && p.ean.trim() !== "") eanPorSku.set(p.sku, p.ean.trim());
        }
      }

      return itens.map((i) => ({
        id: i.id,
        sku: i.sku,
        descricao: i.descricao,
        quantidade: i.quantidade,
        ean: i.sku ? eanPorSku.get(i.sku) ?? null : null,
        cod_cadastro: i.sku ? codPorSku.get(i.sku) ?? null : null,
      }));
    },
  });
}

/**
 * Fotos de conferência visual dos SKUs pedidos (`vw_produto_imagem`). A view já
 * resolve a prioridade variante → produto → galeria, então aqui é uma leitura
 * por `in`. FOTO-NÃO-É-CAMINHO-CRÍTICO: se a leitura falhar, a estação segue
 * sem fotos e sem erro na cara do operador — por isso o erro vira mapa vazio
 * com aviso no console, nunca throw.
 */
export function useImagensProdutosMesa(skus: string[]) {
  const chave = [...new Set(skus)].sort().join(",");
  return useQuery({
    queryKey: ["mesa-sp", "imagens-produtos", chave],
    enabled: chave !== "",
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, ImagemProdutoMesa>> => {
      const { data, error } = await supabaseMesa
        .from("vw_produto_imagem")
        .select("sku, imagem_url, fonte")
        .in("sku", [...new Set(skus)]);
      if (error) {
        console.warn(`fotos dos produtos indisponíveis: ${mensagemErro(error)}`);
        return new Map();
      }
      const mapa = new Map<string, ImagemProdutoMesa>();
      for (const linha of (data ?? []) as ImagemProdutoMesa[]) {
        if (linha.sku && linha.imagem_url) mapa.set(linha.sku, linha);
      }
      return mapa;
    },
  });
}

/**
 * Dimensão de modais (ativos E inativos): opções de escolha filtram `ativo`;
 * nomes no histórico (MOTOBOY/LALAMOVE antigos) continuam resolvendo.
 */
export function useModaisEntrega() {
  return useQuery({
    queryKey: ["mesa-sp", "modais"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ModalEntrega[]> => {
      const { data, error } = await supabaseMesa
        .from("b2c_modal_entrega")
        .select("codigo, nome, tem_rastreio_automatico, exige_etiqueta_correios, sem_despacho, ativo")
        .order("nome", { ascending: true });
      if (error) throw new Error(`ler modais de entrega: ${mensagemErro(error)}`);
      return (data ?? []) as ModalEntrega[];
    },
  });
}

/** Entrega escolhida na venda direta → modal operacional da Mesa SP. */
export function useVdModosModal() {
  return useQuery({
    queryKey: ["mesa-sp", "vd-modos-modal"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<VdModoModal[]> => {
      const { data, error } = await supabaseMesa
        .from("vd_modo_modal")
        .select("modo, modal_codigo");
      if (error) throw new Error(`ler modais da venda direta: ${mensagemErro(error)}`);
      return (data ?? []) as VdModoModal[];
    },
  });
}

/**
 * Caixas reais avaliadas contra o pedido selecionado (`fn_mesa_sp_caixas_sugeridas`).
 * A RPC devolve UMA linha por caixa, já com `cabe`, `motivo` e a `sugerida`
 * (a menor que serve). Falha aqui NÃO trava a embalagem: quem chama decide
 * mostrar o erro em faixa discreta e seguir sem sugestão.
 */
export function useCaixasSugeridas(pedidoId: string | null) {
  return useQuery({
    queryKey: ["mesa-sp", "caixas-sugeridas", pedidoId],
    enabled: !!pedidoId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CaixaSugerida[]> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_caixas_sugeridas", {
        p_pedido_id: pedidoId,
      });
      if (error) throw new Error(`sugerir caixas: ${mensagemErro(error)}`);
      return (data ?? []) as CaixaSugerida[];
    },
  });
}

/** Peso estimado pela ficha (itens + caixa). Só sugestão: a balança decide. */
export function usePesoEstimado(pedidoId: string | null, caixaCodigo: string | null, volumes: number) {
  const vol = Number.isFinite(volumes) && volumes >= 1 ? Math.floor(volumes) : 1;
  return useQuery({
    queryKey: ["mesa-sp", "peso-estimado", pedidoId, caixaCodigo, vol],
    enabled: !!pedidoId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PesoEstimado | null> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_peso_estimado", {
        p_pedido_id: pedidoId,
        p_caixa_codigo: caixaCodigo,
        p_volumes: vol,
      });
      if (error) throw new Error(`estimar peso: ${mensagemErro(error)}`);
      return (data ?? null) as PesoEstimado | null;
    },
  });
}

/**
 * Rotina de bancada por modal. Uma consulta só para todos os modais: a lista é
 * pequena e o operador troca de modal no meio do gesto — buscar por modal
 * deixaria a lista piscar a cada troca.
 */
export function useChecklistEmbalagem() {
  return useQuery({
    queryKey: ["mesa-sp", "checklist-embalagem"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ItemChecklistEmbalagem[]> => {
      const { data, error } = await supabaseMesa
        .from("b2c_embalagem_checklist")
        .select("id, modal_codigo, ordem, rotulo, obrigatorio, observacao")
        .eq("ativo", true)
        .order("modal_codigo", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw new Error(`ler checklist de embalagem: ${mensagemErro(error)}`);
      return (data ?? []) as ItemChecklistEmbalagem[];
    },
  });
}

/**
 * Marcações da rotina JÁ GRAVADAS para este pedido (`b2c_embalagem_marcacao`).
 * A rotina atravessa dois sistemas (o operador sai para o Bling e volta), então
 * a marcação é ato persistido — não estado de tela. Devolve os `item_id`.
 */
export function useMarcacoesEmbalagem(pedidoId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_MARCACOES_MESA, pedidoId],
    enabled: !!pedidoId,
    staleTime: 0,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabaseMesa
        .from("b2c_embalagem_marcacao")
        .select("item_id")
        .eq("pedido_id", pedidoId);
      if (error) throw new Error(`ler marcações da rotina: ${mensagemErro(error)}`);
      return ((data ?? []) as { item_id: string }[]).map((m) => m.item_id);
    },
  });
}

/**
 * Marca/desmarca um item da rotina. Sem toast de sucesso: o gesto é miúdo e
 * repetido — o retorno é o próprio check gravado. Falha sobe INTEIRA (FAIL-LOUD)
 * e a tela volta ao estado anterior porque a verdade é a query do banco.
 */
export function useMarcarRotina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { p_pedido_id: string; p_item_id: string; p_marcado: boolean }) => {
      const { error } = await supabaseMesa.rpc("fn_mesa_sp_marcar_rotina", args);
      if (error) throw new Error(mensagemErro(error));
      return args;
    },
    onSuccess: (args) => {
      void qc.invalidateQueries({ queryKey: [...CHAVE_MARCACOES_MESA, args.p_pedido_id] });
    },
    onError: (e: unknown) => {
      toast.error(mensagemErro(e));
    },
  });
}

/** Estado de cada documento do pedido — vem PRONTO de `fn_mesa_sp_documentos`; a tela não calcula nada. */
export function useDocumentosMesa(pedidoId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_DOCUMENTOS_MESA, pedidoId],
    enabled: !!pedidoId,
    staleTime: 0,
    queryFn: async (): Promise<DocumentoMesa[]> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_documentos", { p_pedido_id: pedidoId });
      if (error) throw new Error(`ler documentos do pedido: ${mensagemErro(error)}`);
      return ((data ?? []) as DocumentoMesa[]).slice().sort((a, b) => a.ordem - b.ordem);
    },
  });
}

export function useDadosImpressao(pedidoId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_DOCUMENTOS_MESA, "dados-impressao", pedidoId],
    enabled: !!pedidoId,
    staleTime: 0,
    queryFn: async (): Promise<DadosImpressao> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_dados_impressao", { p_pedido_id: pedidoId });
      if (error) throw new Error(`ler dados de impressão: ${mensagemErro(error)}`);
      if (!data) throw new Error("ler dados de impressão: o banco não devolveu dados para este pedido.");
      return data as DadosImpressao;
    },
  });
}

/** DANFE Simplificado – Etiqueta: campos lidos do XML no servidor. Falha = etiqueta Fetely sai sozinha. */
export function useDanfeEtiqueta(pedidoId: string | null, temNf: boolean) {
  return useQuery({
    queryKey: [...CHAVE_DOCUMENTOS_MESA, "danfe-etiqueta", pedidoId],
    enabled: !!pedidoId && temNf,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DanfeEtiqueta> => {
      const { data, error } = await supabase.functions.invoke("nf-danfe-etiqueta", { body: { pedido_id: pedidoId } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error(corpo?.error ?? error.message);
      }
      if (!data?.ok) throw new Error(data?.error ?? "resposta inválida da DANFE etiqueta.");
      return data as DanfeEtiqueta;
    },
  });
}

/** RPC miúda de documento (marcar/rastreio): toast de erro inteiro e relê os documentos. */
function useRpcDocumento<TArgs extends { p_pedido_id: string }>(nome: string, sucesso: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { error } = await supabaseMesa.rpc(nome, args);
      if (error) throw new Error(mensagemErro(error));
      return args;
    },
    onSuccess: async (args) => {
      if (sucesso) toast.success(sucesso);
      await qc.invalidateQueries({ queryKey: [...CHAVE_DOCUMENTOS_MESA, args.p_pedido_id] });
      void qc.invalidateQueries({ queryKey: CHAVE_EVENTOS_MESA });
    },
    onError: (e: unknown) => {
      toast.error(mensagemErro(e));
    },
  });
}

export function useMarcarDocumento() {
  return useRpcDocumento<{ p_pedido_id: string; p_documento_id: string; p_marcado: boolean }>("fn_mesa_sp_marcar_documento", null);
}

export function useRegistrarRastreio() {
  return useRpcDocumento<{ p_pedido_id: string; p_codigo: string }>("fn_mesa_sp_registrar_rastreio", "Código de rastreio registrado.");
}

export function useConcluirDocumentos() {
  return useRpcMesa<{ p_pedido_id: string }>(
    "fn_mesa_sp_documentos_ok",
    () => "Documentos concluídos — pedido liberado para despacho.",
  );
}

/** Regras de CEP → modal. A resolução (prefixo mais longo) mora em `tipos.ts`. */
export function useRegrasModal() {
  return useQuery({
    queryKey: ["mesa-sp", "modal-regras"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ModalRegra[]> => {
      const { data, error } = await supabaseMesa
        .from("b2c_modal_regra")
        .select("prefixo_cep, modal_codigo, prioridade")
        .eq("ativo", true);
      if (error) throw new Error(`ler regras de modal: ${mensagemErro(error)}`);
      return (data ?? []) as ModalRegra[];
    },
  });
}

/**
 * Chamada de RPC da mesa com a doutrina de erro da casa: as quatro funções
 * lançam EXCEPTION com mensagem em português pensada para o operador. A mensagem
 * sobe INTEIRA para o toast — nunca é trocada por um "erro ao salvar" genérico.
 */
function useRpcMesa<TArgs extends Record<string, unknown>>(
  nome: string,
  aoDarCerto: (mensagem: string) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { data, error } = await supabaseMesa.rpc(nome, args);
      if (error) throw new Error(mensagemErro(error));
      return data;
    },
    onSuccess: () => {
      toast.success(aoDarCerto(nome));
      // A sub-estação é derivada de evento: sem invalidar os dois, a tela fica
      // mostrando a estação anterior até o staleTime vencer.
      void qc.invalidateQueries({ queryKey: CHAVE_PEDIDOS_MESA });
      void qc.invalidateQueries({ queryKey: CHAVE_EVENTOS_MESA });
      void qc.invalidateQueries({ queryKey: CHAVE_CANCELAMENTOS_MESA });
      // A embalagem apaga as marcações no próprio banco: a tela só relê.
      void qc.invalidateQueries({ queryKey: CHAVE_MARCACOES_MESA });
      void qc.invalidateQueries({ queryKey: CHAVE_DOCUMENTOS_MESA });
      void qc.invalidateQueries({ queryKey: CHAVE_AGUARDANDO_NF_MESA });
    },
    onError: (e: unknown) => {
      toast.error(mensagemErro(e));
    },
  });
}

/** B2B embalados aguardando NF, com o estado da solicitação ao Fiscal (`vw_fila_mesa_sp_aguardando_nf`). */
export function useAguardandoNfMesa() {
  return useQuery({
    queryKey: CHAVE_AGUARDANDO_NF_MESA,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<AguardandoNfMesa[]> => {
      const { data, error } = await supabaseMesa.from("vw_fila_mesa_sp_aguardando_nf").select("*");
      if (error) throw new Error(`ler B2B aguardando NF: ${mensagemErro(error)}`);
      return (data ?? []) as AguardandoNfMesa[];
    },
  });
}

/** `fn_mesa_sp_solicitar_nf` — grava o evento e avisa o Fiscal; repetir = reenviar o aviso. */
export function useSolicitarNf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { p_pedido_id: string; p_observacao: string | null }) => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_solicitar_nf", args);
      if (error) throw new Error(mensagemErro(error));
      return (data ?? {}) as { ok?: boolean; notificados?: number };
    },
    onSuccess: async (r) => {
      if (r.notificados === 0) {
        toast.warning("Solicitação registrada, mas ninguém do Fiscal está cadastrado para receber o aviso.");
      } else {
        toast.success(`NF solicitada ao Fiscal — ${r.notificados ?? "?"} pessoa(s) avisada(s).`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVE_AGUARDANDO_NF_MESA }),
        qc.invalidateQueries({ queryKey: CHAVE_EVENTOS_MESA }),
      ]);
    },
    onError: (e: unknown) => {
      toast.error(mensagemErro(e));
    },
  });
}

export function usePuxarPedido() {
  return useRpcMesa<{ p_pedido_id: string }>(
    "fn_mesa_sp_puxar_pedido",
    () => "Pedido puxado para separação.",
  );
}

export function useIniciarConferencia() {
  return useRpcMesa<{ p_pedido_id: string }>(
    "fn_mesa_sp_iniciar_conferencia",
    () => "Separação concluída — pedido em conferência.",
  );
}

export function useVoltarSeparacao() {
  return useRpcMesa<{ p_pedido_id: string }>(
    "fn_mesa_sp_voltar_separacao",
    () => "Pedido voltou para separação.",
  );
}

export function useRegistrarConferencia() {
  return useRpcMesa<{
    p_pedido_id: string;
    p_itens: ItemConferido[];
    p_ok: boolean;
    p_motivo: string | null;
  }>("fn_mesa_sp_registrar_conferencia", () => "Conferência registrada.");
}

export function useEmbalar() {
  return useRpcMesa<{
    p_pedido_id: string;
    p_peso_kg: number;
    p_volumes: number;
    p_modal: string;
    /**
     * Rótulos marcados na bancada — mantido por COMPATIBILIDADE. A trava real é
     * o banco: a RPC lê `b2c_embalagem_marcacao` e recusa item obrigatório em falta.
     */
    p_checklist: string[];
    /**
     * Caixa escolhida pelo operador (`b2c_embalagem_caixa.codigo`). Opcional:
     * null = embalagem registrada sem caixa informada. A RPC recusa código
     * inexistente, mas aceita caixa diferente da sugerida — escolha é humana.
     */
    p_caixa_codigo: string | null;
  }>("fn_mesa_sp_embalar", () => "Embalagem registrada.");
}

interface FalhaDespachoLote {
  pedido_id: string;
  id_externo: string | null;
  erro: string;
}

interface ResultadoDespachoLote {
  modal: string;
  despachados: number;
  falhas: FalhaDespachoLote[];
  total: number;
}

/**
 * Coleta do dia: o Correios não busca um pedido, busca as caixas. A RPC despacha
 * o lote e devolve as falhas item a item — nenhuma é escondida (FAIL-LOUD): o
 * sucesso parcial vira dois toasts, o da contagem e o das falhas nomeadas.
 */
export function useDespacharLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { p_modal: string; p_pedido_ids: string[] }) => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_despachar_lote", args);
      if (error) throw new Error(mensagemErro(error));
      return data as unknown as ResultadoDespachoLote;
    },
    onSuccess: (r) => {
      const falhas = r?.falhas ?? [];
      if ((r?.despachados ?? 0) > 0) {
        toast.success(
          `${r.despachados} de ${r.total} pedido(s) despachado(s) — ${r.modal} coletou.`,
        );
      }
      if (falhas.length > 0) {
        toast.error(
          `${falhas.length} pedido(s) não despacharam:\n` +
            falhas.map((f) => `${f.id_externo ?? f.pedido_id}: ${f.erro}`).join("\n"),
        );
      }
      void qc.invalidateQueries({ queryKey: CHAVE_PEDIDOS_MESA });
      void qc.invalidateQueries({ queryKey: CHAVE_EVENTOS_MESA });
    },
    onError: (e: unknown) => {
      toast.error(mensagemErro(e));
    },
  });
}

export function useDespachar() {
  return useRpcMesa<{
    p_pedido_id: string;
    p_modal: string;
    p_referencia: string | null;
    p_executor: string | null;
  }>("fn_mesa_sp_despachar", () => "Pedido despachado — saiu da mesa.");
}

/** Cancelamentos solicitados pelos clientes dos pedidos listados (`fn_mesa_sp_cancelamentos`). */
export function useCancelamentosMesaSp(pedidoIds: string[]) {
  const ids = [...new Set(pedidoIds)].sort();
  return useQuery({
    queryKey: [...CHAVE_CANCELAMENTOS_MESA, ids],
    enabled: ids.length > 0,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<Map<string, CancelamentoMesa>> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_cancelamentos", { p_pedido_ids: ids });
      if (error) throw new Error(`ler cancelamentos solicitados: ${mensagemErro(error)}`);
      const mapa = new Map<string, CancelamentoMesa>();
      for (const linha of (data ?? []) as CancelamentoMesa[]) {
        if (linha.pedido_id) mapa.set(linha.pedido_id, linha);
      }
      return mapa;
    },
  });
}

export function useDevolverFila() {
  return useRpcMesa<{ p_pedido_id: string; p_motivo: string }>(
    "fn_mesa_sp_devolver_fila",
    () => "Pedido devolvido para a fila.",
  );
}

/** Encerra pedido com cancelamento solicitado: itens voltaram à prateleira e o pedido sai da mesa como cancelado. */
export function useEncerrarCancelado() {
  return useRpcMesa<{ p_pedido_id: string }>(
    "fn_mesa_sp_encerrar_cancelado",
    () => "Pedido encerrado — itens de volta à prateleira.",
  );
}

/** Modal sugerido pelo banco para o pedido (`fn_mesa_sp_modal_sugerido`); null = escolha livre. */
export function useModalSugerido(pedidoId: string | null) {
  return useQuery({
    queryKey: ["mesa-sp", "modal-sugerido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<ModalSugerido | null> => {
      const { data, error } = await supabaseMesa.rpc("fn_mesa_sp_modal_sugerido", { p_pedido_id: pedidoId });
      if (error) throw new Error(`ler modal sugerido: ${mensagemErro(error)}`);
      const r = data as ModalSugerido | null;
      return r && r.modal ? r : null;
    },
  });
}

/** Executores ativos do Frete Fetely (`mesa_sp_executor`), na ordem do banco. */
export function useExecutoresMesa() {
  return useQuery({
    queryKey: ["mesa-sp", "executores"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ExecutorMesa[]> => {
      const { data, error } = await supabaseMesa
        .from("mesa_sp_executor")
        .select("codigo, modal_codigo, nome, rotulo_cliente, exige_referencia, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw new Error(`ler executores: ${mensagemErro(error)}`);
      return (data ?? []) as ExecutorMesa[];
    },
  });
}

/** Troca de modal com motivo — precisa vir ANTES de `fn_mesa_sp_embalar`. */
export function useTrocarModal() {
  return useRpcMesa<{ p_pedido_id: string; p_modal: string; p_motivo: string }>(
    "fn_mesa_sp_trocar_modal",
    () => "Troca de modal registrada.",
  );
}

export function usePostarAgencia() {
  return useRpcDocumento<{ p_pedido_id: string }>(
    "fn_mesa_sp_postar_agencia",
    "Postagem na agência marcada — bipe o código do comprovante no despacho.",
  );
}
