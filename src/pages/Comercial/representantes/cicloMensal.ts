/**
 * Leitura e vocabulário do ciclo mensal de comissão.
 * Fonte única: view `vw_comissao_extrato_ciclo` (uma linha por extrato fechado).
 */
import { supabase } from "@/integrations/supabase/client";

export interface LinhaCiclo {
  extrato_id: string;
  vendedor_id: string;
  representante: string | null;
  email_contato: string | null;
  competencia: string | null;
  valor_total: number | null;
  pagar_ate: string | null;
  enviar_ate: string | null;
  documento_ate: string | null;
  enviado_em: string | null;
  enviado_para: string | null;
  documento_id: string | null;
  tipo_documento: string | null;
  documento_numero: string | null;
  documento_valor: number | null;
  documento_status: string | null;
  documento_enviado_em: string | null;
  documento_origem: string | null;
  documento_arquivo: string | null;
  cpr_id: string | null;
  cpr_status: string | null;
  pago_em: string | null;
  tem_contraparte: boolean | null;
  etapa: string | null;
  pendencia: string | null;
}

export const BUCKET_DOCUMENTO = "comissao-documento-fiscal";

export const TIPO_DOCUMENTO: Record<string, string> = {
  nf_servico: "NF de serviço",
  rpa: "RPA",
};

/** Ordem das etapas do ciclo — usada para contadores e para liberar ações. */
export const ORDEM_ETAPA: Record<string, number> = {
  "0_zerado": -1,
  "1_fechado": 1,
  "2_enviado": 2,
  "3_documento_recebido": 3,
  "3b_documento_divergente": 3,
  "4_documento_conferido": 4,
  "5_titulo_gerado": 5,
  "6_pago": 6,
};

export function competenciasRecentes(qtd = 24): string[] {
  const hoje = new Date();
  const saida: string[] = [];
  for (let i = 0; i < qtd; i += 1) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    saida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return saida;
}

export function competenciaCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Datas do ciclo derivadas da competência, quando a view ainda não trouxe linha. */
export function datasDaCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const dia = (n: number) => {
    const d = new Date(Date.UTC(ano, mes - 1, 1 + n));
    return d.toISOString().slice(0, 10);
  };
  return { fechamento: dia(0), enviar_ate: dia(4), documento_ate: dia(9), pagar_ate: dia(14) };
}

export async function lerCiclo(competencia: string): Promise<LinhaCiclo[]> {
  const { data, error } = await (supabase as any)
    .from("vw_comissao_extrato_ciclo")
    .select("*")
    .eq("competencia", `${competencia}-01`)
    .order("valor_total", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LinhaCiclo[];
}
