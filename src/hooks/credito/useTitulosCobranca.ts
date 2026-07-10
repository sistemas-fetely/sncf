import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusGestao = "a_vencer" | "vence_hoje" | "atrasado" | "pago" | "cancelado";

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
}

export interface KpisTitulos {
  aVencer: { qtd: number; valor: number };
  venceHoje: { qtd: number; valor: number };
  atrasado: { qtd: number; valor: number };
  pagoNoMes: { qtd: number; valor: number };
  total: { qtd: number; valor: number };
}

function inicioDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function calcularKpis(titulos: TituloCobranca[]): KpisTitulos {
  const mes = inicioDoMes();
  const zero = () => ({ qtd: 0, valor: 0 });
  const k: KpisTitulos = {
    aVencer: zero(), venceHoje: zero(), atrasado: zero(), pagoNoMes: zero(), total: zero(),
  };
  for (const t of titulos) {
    if (t.status_gestao === "cancelado") continue;
    k.total.qtd++; k.total.valor += t.valor_efetivo;
    if (t.status_gestao === "a_vencer")  { k.aVencer.qtd++;  k.aVencer.valor  += t.valor_efetivo; }
    if (t.status_gestao === "vence_hoje"){ k.venceHoje.qtd++; k.venceHoje.valor += t.valor_efetivo; }
    if (t.status_gestao === "atrasado")  { k.atrasado.qtd++; k.atrasado.valor += t.valor_efetivo; }
    if (t.status_gestao === "pago" && (t.data_liquidacao_real ?? "") >= mes) {
      k.pagoNoMes.qtd++; k.pagoNoMes.valor += t.valor_efetivo;
    }
  }
  return k;
}

export function useTitulosCobranca() {
  return useQuery({
    queryKey: ["titulos-cobranca"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulos_cobranca")
        .select("*")
        .order("data_vencimento_atual", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as TituloCobranca[];
    },
    staleTime: 30_000,
  });
}
