// Mesa de Expedição SP — vocabulário da tela.
//
// NUNCA-INVENTAR-STATUS: o estágio macro é `pedidos.estagio` (dimensão que já
// existia). A sub-estação da mesa NÃO é coluna: ela é DERIVADA do último evento
// `mesa_*` em `pedido_eventos`, que é exatamente o que as RPCs `fn_mesa_sp_*`
// escrevem. Se um dia a RPC mudar o evento, a tela acompanha sozinha — não há
// segunda fonte de verdade para manter em dia.

/** Códigos das etapas ativas (`mesa_sp_etapa`). Rótulo e ordem vêm do banco. */
export const ESTACOES = [
  "fila", "separacao", "conferencia", "embalagem", "documentos", "despacho", "aguardando_nf", "nf_emitida",
] as const;

/** `fn_mesa_sp_documentos_ok`: estação Documentos concluída. */
export const EVENTO_DOCUMENTOS_OK = "mesa_documentos_ok";
/** `fn_mesa_sp_registrar_rastreio`: código de rastreio gravado. */
export const EVENTO_RASTREIO_REGISTRADO = "mesa_rastreio_registrado";
/** `fn_mesa_sp_solicitar_nf`: NF do B2B solicitada ao Fiscal (pode repetir = reenvio). */
export const EVENTO_NF_SOLICITADA = "mesa_nf_solicitada";

/** Linha de `vw_fila_mesa_sp_aguardando_nf` — fonte única do estado da solicitação. */
export interface AguardandoNfMesa {
  pedido_id: string;
  id_externo: string | null;
  parceiro_nome: string | null;
  parceiro_cnpj: string | null;
  valor_liquido: number | null;
  volumes: number | null;
  peso_kg: number | null;
  embalado_em: string | null;
  solicitado_em: string | null;
  observacao: string | null;
  solicitado_por: string | null;
  horas_aguardando: number | null;
  exige_acao_nossa: boolean | null;
}

/** Linha de `fn_mesa_sp_documentos` — fonte única do estado de cada documento. */
export interface DocumentoMesa {
  documento_id: string;
  codigo: string;
  tipo: "nf" | "rastreio" | "romaneio" | "etiqueta_volume" | "declaracao" | string;
  ordem: number;
  rotulo: string;
  observacao: string | null;
  obrigatorio: boolean;
  liberado: boolean;
  detalhe: string | null;
  url: string | null;
}
export type Estacao = (typeof ESTACOES)[number];

/** Estações pós-embalagem do B2B: a separação vem ANTES da NF (matriz SP emite). */
export const ESTACOES_B2B_POS_EMBALAGEM = ["aguardando_nf", "nf_emitida"] as const;

/** Eventos que a Mesa SP escreve. Fonte: corpo das RPCs `fn_mesa_sp_*`. */
export const EVENTO_ROTEADO = "roteado_mesa_sp";
export const EVENTO_SEPARACAO_INICIADA = "mesa_separacao_iniciada";
/** `fn_mesa_sp_iniciar_conferencia`: separação concluída, pedido entra em conferência. */
export const EVENTO_CONFERENCIA_INICIADA = "mesa_conferencia_iniciada";
/** `fn_mesa_sp_voltar_separacao`: pedido sai da conferência e volta para separação. */
export const EVENTO_VOLTOU_SEPARACAO = "mesa_voltou_separacao";
export const EVENTO_CONFERENCIA_OK = "mesa_conferencia_ok";
export const EVENTO_CONFERENCIA_DIVERGENCIA = "mesa_conferencia_divergencia";
export const EVENTO_EMBALADO = "mesa_embalado";
export const EVENTO_DESPACHADO = "mesa_despachado";
/** `fn_mesa_sp_devolver_fila`: pedido volta para pre_separacao (cai na fila pelo estágio). */
export const EVENTO_DEVOLVIDO_FILA = "mesa_devolvido_fila";
/** `fn_mesa_sp_encerrar_cancelado`: pedido sai da mesa como cancelado (itens devolvidos à prateleira). */
export const EVENTO_ENCERRADO_CANCELAMENTO = "mesa_encerrado_cancelamento";

/** Estágios macro que a mesa opera. Fora destes, o pedido não é dela. */
export const ESTAGIO_FILA = "pre_separacao";
export const ESTAGIO_NA_MESA = "em_separacao";
/** B2B embalado na mesa espera a NF da matriz SP. */
export const ESTAGIO_PRE_FATURAMENTO = "pre_faturamento";
/** B2B com NF emitida — despacho é a fatia F4. */
export const ESTAGIO_FATURADO = "faturado";
/** Código do CD que habilita B2B na Mesa SP (`centro_distribuicao.codigo`). */
export const CENTRO_SITE_SP = "SITE-SP";

export interface PedidoMesa {
  id: string;
  id_externo: string;
  estagio: string;
  canal: string;
  cliente_nome: string | null;
  valor_liquido: number;
  recebido_em: string;
  /** Json cru do pedido — o CEP sai daqui para sugerir o modal. */
  endereco_entrega: unknown;
  /** Etapa derivada no banco (`vw_mesa_sp_quadro`) — fonte única. */
  etapa: string;
  etapa_ordem: number | null;
  etapa_rotulo: string | null;
  limite_min: number | null;
  entrou_em: string | null;
  minutos_parado: number | null;
  estourou_limite: boolean;
}

/** Linha ativa de `mesa_sp_etapa`. */
export interface EtapaMesa {
  canal: string;
  codigo: string;
  ordem: number;
  rotulo: string;
  limite_min: number | null;
}

/** Colunas do quadro: etapas comuns unidas por código; exclusivas do B2B depois de `despacho`. */
export function colunasQuadro(etapas: EtapaMesa[]): { codigo: string; rotulo: string }[] {
  const b2c = etapas.filter((e) => e.canal.toUpperCase() !== "B2B").sort((a, b) => a.ordem - b.ordem);
  const b2b = etapas.filter((e) => e.canal.toUpperCase() === "B2B").sort((a, b) => a.ordem - b.ordem);
  const vistos = new Set<string>();
  const out: { codigo: string; rotulo: string }[] = [];
  for (const e of [...b2c, ...b2b]) {
    if (vistos.has(e.codigo)) continue;
    vistos.add(e.codigo);
    out.push({ codigo: e.codigo, rotulo: e.rotulo });
  }
  return out;
}

/** "há 12 min / há 3h / há 2d". */
export function tempoParado(minutos: number | null | undefined): string {
  if (minutos == null || !Number.isFinite(minutos)) return "—";
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
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
  /** Código de cadastro do produto (`sncf_produtos.cod_cadastro`). */
  cod_cadastro: string | null;
}

/** Linha de `fn_mesa_sp_cancelamentos`: pedido com cancelamento solicitado pelo cliente. */
export interface CancelamentoMesa {
  pedido_id: string;
  numero: string;
  motivo: string | null;
}

/**
 * Foto de conferência visual (`vw_produto_imagem`). `fonte` diz de onde a URL
 * veio — a cascata de quatro degraus: 'variante' (cor certa), 'produto'
 * (principal do Shopify), 'galeria' (primeira da galeria) e 'cor' (foto do FOP
 * da coleção+cor — NÃO é foto do produto). A foto genérica da coleção ficou de
 * fora de propósito: em conferência ela induz o conferente a validar errado.
 * A foto é CONFERÊNCIA VISUAL, nunca critério de aceite — quem valida a peça
 * continua sendo o EAN.
 */
export interface ImagemProdutoMesa {
  sku: string;
  imagem_url: string;
  fonte: "propria" | "variante" | "produto" | "galeria" | "cor";
}

export interface ModalEntrega {
  codigo: string;
  nome: string;
  tem_rastreio_automatico: boolean;
  exige_etiqueta_correios: boolean;
  /** Modal encerrado fora da Mesa (ex.: retirada registrada em Pedidos Site SP). */
  sem_despacho: boolean;
}

/** Mapeamento mantido no banco entre a entrega vendida e o modal da bancada. */
export interface VdModoModal {
  modo: string;
  modal_codigo: string;
}

/**
 * Rotina de bancada por modal (`b2c_embalagem_checklist`). A lista NÃO é fixa no
 * código: cada modal tem a sua, e a RPC recusa a embalagem quando falta item
 * obrigatório — a tela só antecipa essa recusa (DIMENSÃO-VIA-TABELA).
 */
export interface ItemChecklistEmbalagem {
  /** Chave do item no banco — é por ela que a marcação é persistida. */
  id: string;
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

/** Pedido B2B (canal gravado em `pedidos.canal`). */
export function pedidoEhB2B(canal: string | null | undefined): boolean {
  return (canal ?? "").toUpperCase() === "B2B";
}

/** Pedido de venda direta do Site SP, identificado pelo número canônico VD-. */
export function pedidoEhVendaDireta(idExterno: string): boolean {
  return idExterno.toUpperCase().startsWith("VD-");
}

/** Modo escolhido na venda, gravado em `endereco_entrega.modal`. */
export function modoEntregaVendaDireta(endereco: unknown): string | null {
  if (!endereco || typeof endereco !== "object") return null;
  const valor = (endereco as Record<string, unknown>).modal;
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim().toLowerCase() : null;
}

const ROTULO_ENTREGA_VD: Record<string, string> = {
  retirada: "Retirada",
  sedex: "SEDEX",
  pac: "PAC",
  frete_fetely: "Frete Fetely",
};

export function rotuloEntregaVendaDireta(modo: string | null): string {
  if (!modo) return "Entrega não informada";
  return ROTULO_ENTREGA_VD[modo] ?? modo;
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
 * Linha de `fn_mesa_sp_caixas_sugeridas`: cada caixa real (`b2c_embalagem_caixa`)
 * avaliada contra ESTE pedido. SISTEMA SUGERE / HUMANO DECIDE — a que não cabe
 * chega com `motivo`, a menor que serve chega com `sugerida = true`, e a palavra
 * final continua do operador (a RPC de embalar não recusa caixa diferente).
 */
export interface CaixaSugerida {
  codigo: string;
  nome: string;
  /** Texto pronto do banco, ex.: "35 x 35 x 16 cm". */
  medidas: string;
  volume_util_cm3: number;
  cabe: boolean;
  motivo: string | null;
  sugerida: boolean;
  /** Quanto do volume útil o pedido ocupa, 0–100. */
  ocupacao_pct: number;
  /** Quantos volumes desta caixa o pedido exige. */
  volumes: number;
  /** Volume externo total (todos os volumes), cm³. */
  ext_cm3: number;
  /** Acima de 30.000 cm³ externos — Correios cobra peso cúbico. */
  acima_limite_correios: boolean;
  jogo_americano_curvado: boolean;
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

/** Chave de comparação de código de barras: se for só dígitos (EAN/UPC/GTIN), ignora zeros à esquerda — UPC-A (12) e EAN-13 com 0 na frente são o mesmo código. Alfanumérico (SKU) fica como está. */
export function chaveCodigo(v: string | null | undefined): string {
  const n = normalizarCodigo(v ?? "");
  return /^\d+$/.test(n) ? n.replace(/^0+/, "") : n;
}


/** Retorno de `fn_mesa_sp_peso_estimado`: estimativa da ficha, ponto de partida para a balança. */
export interface PesoEstimado {
  itens_kg: number;
  caixa_kg: number | null;
  caixa_sem_peso: boolean;
  total_kg: number;
  completo: boolean;
  itens_sem_peso: { sku: string; descricao: string | null; quantidade: number }[];
  qtd_itens_sem_peso: number;
}
