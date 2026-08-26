import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  EixoProva,
  EixoStatus,
  EixoRecebimento,
  EixoPrazo,
  EixoInstrumento,
} from "@/lib/financeiro/eixos-estado";

export type StatusGestao =
  | "a_vencer"
  | "vence_hoje"
  | "atrasado"
  | "aguarda_liquidacao"
  | "pago"
  | "pago_com_atraso"
  | "pago_judicial"
  | "cancelado"
  /* terminais que NÃO são inadimplência */
  | "devolvido"
  | "baixado_por_perda";




/** Espelha titulo_a_receber_subestado_atraso_check. Não inventar valor aqui. */
export type SubestadoAtraso =
  | "em_dia"
  | "lembrete_amistoso"
  | "cobranca_ativa"
  | "cobranca_formal"
  | "pre_juridico"
  | "notificacao_extrajudicial"
  | "protesto_solicitado"
  | "juridico"
  | null;

export interface TituloCobranca {
  id: string;
  numero_titulo: string;
  numero_parcela: number;
  total_parcelas: number;
  eh_entrada: boolean;
  created_at: string;
  status_real: string;
  tipo_pagamento: string;

  boleto_status: string | null;
  boleto_codigo_rejeicao: string | null;
  status_gestao: StatusGestao;

  dias_atraso: number;
  valor_bruto: number;
  valor_efetivo: number;
  valor_juros: number;
  valor_multa: number;
  valor_desconto: number;
  data_vencimento_original: string;
  data_vencimento_atual: string;
  data_liquidacao_prevista: string | null;
  data_liquidacao_real: string | null;
  data_pagamento: string | null;
  data_pagamento_banco: string | null;
  linha_digitavel: string | null;
  nosso_numero_seq: string | null;
  boleto_enviado_em: string | null;
  email_cobranca_enviado_em: string | null;
  data_proxima_acao_regua: string | null;
  pausa_regua_automatica: boolean;
  subestado_atraso: SubestadoAtraso;
  vip_relacionamento: boolean | null;
  flag_bandeira_amarela: boolean | null;
  flag_grupo_economico_inadimplente: boolean | null;
  modalidade_renegociacao: number | null;
  titulo_renegociado_origem_id: string | null;
  conta_id: string;
  pedido_id: string;
  nf_id: string | null;
  remessa_safra_id: string | null;
  banco_recebimento_id: string | null;
  parceiro_id: string | null;
  parceiro_razao_social: string | null;
  parceiro_nome_fantasia: string | null;
  parceiro_cnpj: string | null;
  pedido_id_externo: string | null;
  pedido_estagio: string | null;
  nf_numero: string | null;
  banco_nome: string | null;
  reemissao_nova_data: string | null;
  reemissao_novo_valor: number | null;
  reemissao_motivo: string | null;
  reemissao_aplicada_em: string | null;
  prorrogacao_nova_data: string | null;
  prorrogacao_solicitada_em: string | null;
  inconsistencia_pagamento?: boolean | null;
  parceiro_email?: string | null;
  parceiro_email_cobranca?: string | null;
  link_pagamento?: string | null;
  data_pago_efetiva: string | null;
  aguardando_credito: boolean | null;
  relogio_pontualidade: "cliente" | "adquirente" | null;
  dias_pontualidade: number | null;
  /* @deprecated dois eixos antigos — usar eixo_recebimento / eixo_instrumento */
  eixo_prova: EixoProva;
  eixo_status: EixoStatus;
  compensado_por: "banco" | "manual" | null;
  /** @deprecated usar eh_inadimplente */
  eh_inadimplencia: boolean | null;
  /* vocabulário honesto */
  eixo_recebimento: EixoRecebimento;
  eixo_prazo: EixoPrazo;
  eixo_instrumento: EixoInstrumento;
  eh_inadimplente: boolean | null;
}


export interface KpisTitulos {
  aVencer: { qtd: number; valor: number };
  venceHoje: { qtd: number; valor: number };
  atrasado: { qtd: number; valor: number };
  pagoNoMes: { qtd: number; valor: number };
  pagoNoMesAguardando: { qtd: number; valor: number };
  total: { qtd: number; valor: number };
}

function inicioDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/**
 * Encerrado não entra em KPI de cobrança.
 * Lê `status_real` (domínio do CHECK), não eixo derivado: blinda o KPI
 * contra renomeação de vocabulário dos eixos.
 */
const STATUS_ENCERRADOS = new Set([
  "cancelado",
  "cancelado_recuperacao",
  "devolvido",
  "baixado_por_perda",
  "renegociado",
]);

const STATUS_PAGOS: StatusGestao[] = ["pago", "pago_com_atraso", "pago_judicial"];

export function tituloEntraNoKpi(t: TituloCobranca): boolean {
  return !STATUS_ENCERRADOS.has(t.status_real);
}

export function calcularKpis(titulos: TituloCobranca[]): KpisTitulos {
  const mes = inicioDoMes();
  const zero = () => ({ qtd: 0, valor: 0 });
  const k: KpisTitulos = {
    aVencer: zero(), venceHoje: zero(), atrasado: zero(), pagoNoMes: zero(), pagoNoMesAguardando: zero(), total: zero(),
  };
  for (const t of titulos) {
    if (!tituloEntraNoKpi(t)) continue;
    const v = t.valor_efetivo ?? 0;
    k.total.qtd++; k.total.valor += v;
    if (t.status_gestao === "a_vencer")   { k.aVencer.qtd++;   k.aVencer.valor   += v; }
    if (t.status_gestao === "vence_hoje") { k.venceHoje.qtd++; k.venceHoje.valor += v; }
    if (t.status_gestao === "atrasado")   { k.atrasado.qtd++;  k.atrasado.valor  += v; }
    // "Pago no mês" mede PAGAMENTO, não liquidez — cartão pago e ainda não creditado
    // pela adquirente conta aqui e aparece na quebra.
    if (STATUS_PAGOS.includes(t.status_gestao) && (t.data_pago_efetiva ?? "") >= mes) {
      k.pagoNoMes.qtd++; k.pagoNoMes.valor += v;
      if (t.aguardando_credito) { k.pagoNoMesAguardando.qtd++; k.pagoNoMesAguardando.valor += v; }
    }
  }
  return k;
}


const LIMITE_TITULOS = 5000;

export function useTitulosCobranca() {
  return useQuery({
    queryKey: ["titulos-cobranca"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulos_cobranca")
        .select("*")
        .order("data_vencimento_atual", { ascending: true })
        .limit(LIMITE_TITULOS);
      if (error) throw error;
      const linhas = (data ?? []) as TituloCobranca[];
      if (linhas.length >= LIMITE_TITULOS) {
        throw new Error(
          `Teto de ${LIMITE_TITULOS} títulos atingido — a tela mostraria um recorte silencioso. Pagine antes de usar.`,
        );
      }
      return linhas;
    },
    staleTime: 30_000,
  });
}
