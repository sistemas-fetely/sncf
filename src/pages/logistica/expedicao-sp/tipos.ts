// Mesa de Expedição SP — vocabulário da tela.
//
// NUNCA-INVENTAR-STATUS: o estágio macro é `pedidos.estagio` (dimensão que já
// existia). A sub-estação da mesa NÃO é coluna: ela é DERIVADA do último evento
// `mesa_*` em `pedido_eventos`, que é exatamente o que as RPCs `fn_mesa_sp_*`
// escrevem. Se um dia a RPC mudar o evento, a tela acompanha sozinha — não há
// segunda fonte de verdade para manter em dia.

/** Estações da bancada, na ordem em que o pedido as atravessa. */
export const ESTACOES = ["fila", "separacao", "conferencia", "embalagem", "despacho"] as const;
export type Estacao = (typeof ESTACOES)[number];

export const ROTULO_ESTACAO: Record<Estacao, string> = {
  fila: "Fila",
  separacao: "Separação",
  conferencia: "Conferência",
  embalagem: "Embalagem",
  despacho: "Despacho",
};

/** Eventos que a Mesa SP escreve. Fonte: corpo das RPCs `fn_mesa_sp_*`. */
export const EVENTO_ROTEADO = "roteado_mesa_sp";
export const EVENTO_SEPARACAO_INICIADA = "mesa_separacao_iniciada";
export const EVENTO_CONFERENCIA_OK = "mesa_conferencia_ok";
export const EVENTO_CONFERENCIA_DIVERGENCIA = "mesa_conferencia_divergencia";
export const EVENTO_EMBALADO = "mesa_embalado";
export const EVENTO_DESPACHADO = "mesa_despachado";

/** Estágios macro que a mesa opera. Fora destes, o pedido não é dela. */
export const ESTAGIO_FILA = "pre_separacao";
export const ESTAGIO_NA_MESA = "em_separacao";

export interface PedidoMesa {
  id: string;
  id_externo: string;
  estagio: string;
  canal: string;
  cliente_nome_snapshot: string | null;
  valor_liquido: number;
  recebido_em: string;
  /** Json cru do pedido — o CEP sai daqui para sugerir o modal. */
  endereco_entrega: unknown;
}

/** Identidades do mesmo pedido nos sistemas usados pela operação B2C. */
export interface IdentidadesPedidoMesa {
  pedido_id: string;
  order_name: string | null;
  bling_pedido_numero: string | null;
  nf_refs: string | null;
}

export interface EventoMesa {
  id: string;
  pedido_id: string;
  tipo_evento: string;
  descricao: string | null;
  criado_em: string;
  metadata: unknown;
}

export interface ItemPedidoMesa {
  id: string;
  sku: string | null;
  descricao: string;
  quantidade: number;
  /** Vem do espelho `sncf_produtos` pelo SKU. Nulo = item sem EAN cadastrado. */
  ean: string | null;
}

export interface ModalEntrega {
  codigo: string;
  nome: string;
  tem_rastreio_automatico: boolean;
  exige_etiqueta_correios: boolean;
}

/**
 * Rotina de bancada por modal (`b2c_embalagem_checklist`). A lista NÃO é fixa no
 * código: cada modal tem a sua, e a RPC recusa a embalagem quando falta item
 * obrigatório — a tela só antecipa essa recusa (DIMENSÃO-VIA-TABELA).
 */
export interface ItemChecklistEmbalagem {
  modal_codigo: string;
  ordem: number;
  rotulo: string;
  obrigatorio: boolean;
  observacao: string | null;
}

/** O que a embalagem registrou — lido do metadata do evento `mesa_embalado`. */
export interface EmbalagemRegistrada {
  modal: string | null;
  peso_kg: number | null;
  volumes: number | null;
  /** Quando a caixa ficou pronta — é daqui que sai a espera pela coleta. */
  criado_em: string;
}

/**
 * Último `mesa_embalado` do pedido. Null = pedido que ainda não foi embalado
 * (ou evento sem metadata legível: mostramos o que der, nunca um número chutado).
 */
export function embalagemDoPedido(eventos: EventoMesa[]): EmbalagemRegistrada | null {
  const embalado = [...eventos]
    .filter((e) => e.tipo_evento === EVENTO_EMBALADO)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .at(-1);
  if (!embalado) return null;

  const meta = (embalado.metadata && typeof embalado.metadata === "object"
    ? embalado.metadata
    : {}) as Record<string, unknown>;
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    modal: typeof meta.modal === "string" && meta.modal.trim() !== "" ? meta.modal : null,
    peso_kg: numero(meta.peso_kg),
    volumes: numero(meta.volumes),
    criado_em: embalado.criado_em,
  };
}

export interface ModalRegra {
  prefixo_cep: string | null;
  modal_codigo: string;
  prioridade: number;
}

/** Payload de `p_itens` da RPC de conferência — formato fechado no briefing. */
export interface ItemConferido {
  sku: string | null;
  ean: string | null;
  esperado: number;
  bipado: number;
}

/**
 * Estação BASE do pedido, lida só dos fatos gravados no banco.
 *
 * A conferência não tem evento de "entrada" (a RPC só grava o desfecho), então
 * ela nunca aparece aqui: quem leva o pedido de Separação para Conferência é o
 * botão "Concluir separação", que é navegação de tela, não transição de estágio.
 * Divergência devolve o pedido para Separação — retrabalho, sem mexer no estágio.
 */
export function estacaoBase(estagio: string, eventos: EventoMesa[]): Estacao | "despachado" {
  if (estagio === ESTAGIO_FILA) return "fila";
  if (estagio !== ESTAGIO_NA_MESA) return "despachado";

  const ultimo = [...eventos]
    .filter((e) => e.tipo_evento.startsWith("mesa_"))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .at(-1);

  switch (ultimo?.tipo_evento) {
    case EVENTO_EMBALADO:
      return "despacho";
    case EVENTO_CONFERENCIA_OK:
      return "embalagem";
    case EVENTO_CONFERENCIA_DIVERGENCIA:
    case EVENTO_SEPARACAO_INICIADA:
      return "separacao";
    default:
      // Em separação sem nenhum evento da mesa: o pedido entrou por outro
      // caminho. Mostra em Separação em vez de sumir — FAIL-LOUD visível.
      return "separacao";
  }
}

/** Só dígitos; CEP brasileiro tem 8. Retorna null quando não dá para confiar. */
export function cepDoEndereco(endereco: unknown): string | null {
  if (!endereco || typeof endereco !== "object") return null;
  const e = endereco as Record<string, unknown>;
  // O Json de entrega não tem contrato único no SNCF (nasce do Shopify, do Bling
  // ou da porta de pedidos). Tentamos as chaves conhecidas e desistimos em paz:
  // sem CEP a sugestão de modal cai na regra default, que é o comportamento certo.
  for (const chave of ["cep", "zip", "codigo_postal", "postal_code", "zipcode"]) {
    const bruto = e[chave];
    if (typeof bruto !== "string" && typeof bruto !== "number") continue;
    const digitos = String(bruto).replace(/\D/g, "");
    if (digitos.length === 8) return digitos;
  }
  return null;
}

/**
 * Resolve o modal sugerido: entre as regras ativas cujo `prefixo_cep` casa com
 * o CEP, vence o PREFIXO MAIS LONGO (empate: menor `prioridade`). Sem CEP ou sem
 * casamento, cai na regra sem prefixo (a default). Sem nenhuma regra, null — a
 * tela então não sugere nada em vez de chutar um modal.
 */
export function modalSugerido(cep: string | null, regras: ModalRegra[]): string | null {
  const porPrioridade = (a: ModalRegra, b: ModalRegra) => a.prioridade - b.prioridade;

  if (cep) {
    const casadas = regras
      .filter((r) => r.prefixo_cep && cep.startsWith(r.prefixo_cep))
      .sort((a, b) => {
        const porTamanho = (b.prefixo_cep?.length ?? 0) - (a.prefixo_cep?.length ?? 0);
        return porTamanho !== 0 ? porTamanho : porPrioridade(a, b);
      });
    if (casadas.length > 0) return casadas[0].modal_codigo;
  }

  const defaults = regras.filter((r) => !r.prefixo_cep).sort(porPrioridade);
  return defaults[0]?.modal_codigo ?? null;
}

/** Normaliza leitura de código de barras: leitor pode mandar espaço/quebra junto. */
export function normalizarCodigo(v: string): string {
  return v.trim().replace(/\s+/g, "").toUpperCase();
}
