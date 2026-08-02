import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any;

export type ParCartao = {
  movimentacao_id: string;
  data_transacao: string | null;
  credito: number | null;
  descricao: string | null;
  nsu: string | null;
  parcela: number | null;
  titulo_id: string | null;
  numero_titulo: string | null;
  total_parcelas: number | null;
  titulo_bruto: number | null;
  taxa_adquirente_prevista: number | null;
  taxa_observada_gravada: number | null;
  pedido_ref: string | null;
  taxa_implicita: number | null;
  taxa_pct: number | null;
  delta_observado_previsto: number | null;
  tolerancia_taxa_pct: number | null;
  elegivel_automatico: boolean | null;
  situacao: string;
};

export type DetalhePar = {
  nsu?: string | null;
  parcela?: number | null;
  titulo?: string | null;
  pedido?: string | null;
  credito?: number | null;
  taxa_observada?: number | null;
  delta_vs_previsto?: number | null;
  ok?: boolean | null;
  erro?: string | null;
};

export type ExecucaoAuto = {
  id: string;
  executado_em: string;
  origem: string | null;
  candidatos: number | null;
  conciliados: number | null;
  recusados: number | null;
  valor_conciliado: number | null;
  detalhe: DetalhePar[] | null;
};

/** Rótulo e tom de cada situação da view. O veredito vem do banco; aqui só o texto. */
export const SITUACAO_META: Record<
  string,
  { rotulo: string; tom: "verde" | "ambar" | "vermelho" | "neutro"; explicacao?: string }
> = {
  pronto_para_automatico: {
    rotulo: "Pronto para automático",
    tom: "verde",
    explicacao: "Concilia na próxima passada do robô, sem intervenção.",
  },
  sem_titulo_com_este_nsu_e_parcela: {
    rotulo: "Sem título com este NSU e parcela",
    tom: "ambar",
    explicacao:
      "O dinheiro já caiu no banco, mas nenhum título tem esse NSU carimbado. Vincule a venda ao pedido na aba \"Vincular vendas\": na hora seguinte esses créditos conciliam sozinhos, sem ninguém fazer nada.",
  },
  credito_ja_conciliado: {
    rotulo: "Crédito já conciliado",
    tom: "neutro",
    explicacao: "Histórico — nada a fazer.",
  },
  credito_duplicado: {
    rotulo: "Crédito duplicado",
    tom: "vermelho",
    explicacao: "Mais de um crédito no extrato para a mesma chave. Resolver a montante.",
  },
  parcela_ja_tem_movimentacao: {
    rotulo: "Parcela já tem movimentação",
    tom: "ambar",
  },
  titulo_terminal: {
    rotulo: "Título em estado terminal",
    tom: "neutro",
  },
  par_banco_forma_sem_regra: {
    rotulo: "Par banco/forma sem regra",
    tom: "vermelho",
    explicacao: "Falta cadastrar a regra de banco/forma de pagamento para esse par.",
  },
  taxa_fora_da_tolerancia: {
    rotulo: "Taxa fora da tolerância",
    tom: "vermelho",
    explicacao: "A taxa implícita passou da tolerância cadastrada. O robô não decide isso.",
  },
};

/** Ordem de apresentação dos grupos: trabalho primeiro, histórico por último. */
export const ORDEM_SITUACAO = [
  "sem_titulo_com_este_nsu_e_parcela",
  "pronto_para_automatico",
  "taxa_fora_da_tolerancia",
  "par_banco_forma_sem_regra",
  "credito_duplicado",
  "parcela_ja_tem_movimentacao",
  "titulo_terminal",
  "credito_ja_conciliado",
];

export const KEY_PARES = ["cartao-auto-pares"];
export const KEY_EXECUCOES = ["cartao-auto-execucoes"];

export function useConciliacaoAutomatica() {
  const pares = useQuery({
    queryKey: KEY_PARES,
    queryFn: async () => {
      const { data, error } = await sb.from("vw_cartao_credito_par").select("*");
      if (error) throw error;
      return (data || []) as ParCartao[];
    },
  });

  const execucoes = useQuery({
    queryKey: KEY_EXECUCOES,
    queryFn: async () => {
      const { data, error } = await sb
        .from("cartao_conciliacao_auto_log")
        .select("id, executado_em, origem, candidatos, conciliados, recusados, valor_conciliado, detalhe")
        .order("executado_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as ExecucaoAuto[];
    },
  });

  return { pares, execucoes };
}

export type ResultadoRodada = {
  ok?: boolean;
  candidatos?: number;
  conciliados?: number;
  recusados?: number;
  valor_conciliado?: number;
  log_gravado?: boolean;
  detalhe?: DetalhePar[];
  error?: string;
};

/** Dispara a rodada manual. A RPC não lança em recusa: quem chama lê o retorno. */
export async function rodarConciliacaoAgora(): Promise<ResultadoRodada> {
  const { data, error } = await sb.rpc("conciliar_cartao_lote_automatico", {
    p_origem: "manual_tela",
  });
  if (error) throw error;
  return (data || {}) as ResultadoRodada;
}
