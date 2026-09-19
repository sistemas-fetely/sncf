import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import {
  ESTAGIO_FILA, ESTAGIO_NA_MESA, EVENTO_ROTEADO,
  type CaixaSugerida, type EventoMesa, type IdentidadesPedidoMesa, type ItemChecklistEmbalagem, type ItemConferido, type ItemPedidoMesa,
  type ModalEntrega, type ModalRegra, type PedidoMesa,
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

/**
 * Mensagem de erro do Postgres/PostgREST sem engolir nada (FAIL-LOUD).
 * `formatError` é a doutrina da casa: o erro do PostgREST não é `Error` de
 * verdade em runtime, e `String(e)` nele devolve "[object Object]".
 */
const mensagemErro = formatError;

/**
 * Pedidos que a Mesa SP opera: B2C, em pré-separação (fila) ou em separação
 * (já na bancada), E roteados para a mesa por evento `roteado_mesa_sp`.
 *
 * A ordem das duas consultas importa: primeiro os pedidos (conjunto pequeno,
 * limitado por canal + estágio), depois os eventos só desses ids. O contrário
 * varreria `pedido_eventos` inteiro.
 */
export function usePedidosMesaSp() {
  return useQuery({
    queryKey: CHAVE_PEDIDOS_MESA,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<PedidoMesa[]> => {
      const { data: pedidos, error } = await supabaseMesa
        .from("pedidos")
        .select(
          "id, id_externo, estagio, canal, cliente_nome_snapshot, valor_liquido, recebido_em, endereco_entrega",
        )
        .eq("canal", "B2C")
        .in("estagio", [ESTAGIO_FILA, ESTAGIO_NA_MESA])
        .order("recebido_em", { ascending: true });
      if (error) throw new Error(`ler pedidos da mesa: ${mensagemErro(error)}`);

      const linhas = (pedidos ?? []) as PedidoMesa[];
      if (linhas.length === 0) return [];

      const { data: roteados, error: eRot } = await supabaseMesa
        .from("pedido_eventos")
        .select("pedido_id")
        .eq("tipo_evento", EVENTO_ROTEADO)
        .in("pedido_id", linhas.map((p) => p.id));
      if (eRot) throw new Error(`ler roteamento da mesa: ${mensagemErro(eRot)}`);

      const naMesa = new Set((roteados ?? []).map((r: { pedido_id: string }) => r.pedido_id));
      return linhas.filter((p) => naMesa.has(p.id));
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
 * Foto de produto ficou de fora: `produtos.imagem_url` está vazia no banco
 * inteiro, então não havia caminho barato que o briefing pedia.
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
      if (skus.length > 0) {
        const { data: prods, error: eProd } = await supabaseMesa
          .from("sncf_produtos")
          .select("sku, ean")
          .in("sku", skus);
        if (eProd) throw new Error(`ler EAN dos produtos: ${mensagemErro(eProd)}`);
        for (const p of (prods ?? []) as { sku: string; ean: string | null }[]) {
          if (p.ean && p.ean.trim() !== "") eanPorSku.set(p.sku, p.ean.trim());
        }
      }

      return itens.map((i) => ({
        id: i.id,
        sku: i.sku,
        descricao: i.descricao,
        quantidade: i.quantidade,
        ean: i.sku ? eanPorSku.get(i.sku) ?? null : null,
      }));
    },
  });
}

/** Dimensão de modais ativos — o select da embalagem lê daqui, nunca de lista fixa. */
export function useModaisEntrega() {
  return useQuery({
    queryKey: ["mesa-sp", "modais"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ModalEntrega[]> => {
      const { data, error } = await supabaseMesa
        .from("b2c_modal_entrega")
        .select("codigo, nome, tem_rastreio_automatico, exige_etiqueta_correios")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw new Error(`ler modais de entrega: ${mensagemErro(error)}`);
      return (data ?? []) as ModalEntrega[];
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
        .select("modal_codigo, ordem, rotulo, obrigatorio, observacao")
        .eq("ativo", true)
        .order("modal_codigo", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw new Error(`ler checklist de embalagem: ${mensagemErro(error)}`);
      return (data ?? []) as ItemChecklistEmbalagem[];
    },
  });
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
    /** Rótulos marcados na bancada. A RPC recusa se faltar item obrigatório. */
    p_checklist: string[];
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
  }>("fn_mesa_sp_despachar", () => "Pedido despachado — saiu da mesa.");
}
