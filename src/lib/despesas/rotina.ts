export type QuantidadeValor = { qtd: number; valor: number };
export interface RotinaContasPagar {
  gerado_em: string;
  precisa_de_voce: {
    classificar: { grupos: number; itens: number; valor: number; grupos_com_sugestao: number };
    notas_sem_titulo: { notas: number; valor: number };
    pago_sem_destino: { debitos: number; valor: number; com_sugestao: number };
    vencidos: { titulos: number; valor: number };
    a_pagar_7_dias: { titulos: number; valor: number };
  };
  sistema_resolveu_7_dias: {
    baixas_automaticas: QuantidadeValor;
    titulos_nascidos_sozinhos: QuantidadeValor;
    classificadas_por_regra: QuantidadeValor;
    classificadas_a_mao: QuantidadeValor;
    duplicados_barrados: QuantidadeValor;
  };
  entradas: { ordem: number; entrada: string; ultima_data: string | null; dias: number | null }[];
  meses: MesRotina[];
  conta_corrente?: ContaCorrenteFornecedor[];
}
export interface ContaCorrenteFornecedor {
  cnpj: string | null;
  nome: string;
  documentado: number;
  pago: number;
  saldo: number;
  vencido: number;
  a_vencer: number;
  sem_vencimento: number;
  proximo_vencimento: string | null;
  notas_abertas: number;
  ultimo_pagamento: string | null;
}
export function contaCorrenteFornecedores(rotina: Pick<RotinaContasPagar, "conta_corrente"> | null | undefined): ContaCorrenteFornecedor[] {
  return rotina?.conta_corrente ?? [];
}
export interface MesRotina {
  mes: string;
  despesas_sem_conta: number;
  valor_sem_conta: number;
  debitos_sem_destino: number;
  valor_sem_destino: number;
}
export function situacaoEntrada(dias: number | null) {
  if (dias === null) return { texto: "Sem dados — importar", tom: "text-destructive" };
  if (dias <= 3) return { texto: "Em dia", tom: "text-success" };
  if (dias <= 7) return { texto: `Há ${dias} dias`, tom: "text-warning" };
  return { texto: `Há ${dias} dias — importar`, tom: "text-destructive" };
}
export function situacaoMes(mes: Pick<MesRotina, "despesas_sem_conta" | "debitos_sem_destino">) {
  const pendencias = mes.despesas_sem_conta + mes.debitos_sem_destino;
  return pendencias === 0
    ? { texto: "Pronto para fechar", tom: "text-success", pendencias }
    : { texto: `Faltam ${pendencias} pendências`, tom: "text-warning", pendencias };
}
export function rotuloMes(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  if (!ano || !numero || numero > 12) return mes;
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, numero - 1, 1))).replace(".", "");
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`;
}
export function linhaPendente(quantidade: number) {
  return { esmaecida: quantidade === 0, podeAbrir: quantidade > 0 };
}