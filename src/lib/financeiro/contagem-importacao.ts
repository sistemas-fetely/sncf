/**
 * CONTA-FECHADA-OU-ERRO (01/09/2026)
 *
 * O importador de extrato perdia linha em silêncio: `linhas_lidas` maior que
 * `novas + duplicadas`, status `concluida`, nenhum erro. 1.831 linhas lidas e
 * não contabilizadas em 105 importações. Ninguém sabia distinguir "descartei de
 * propósito" de "perdi".
 *
 * Regra: toda linha lida termina em exatamente uma de três gavetas —
 *   linhas_lidas = linhas_novas + linhas_duplicadas + linhas_ignoradas
 * e toda linha que cai em `ignoradas` declara o MOTIVO.
 *
 * ENRIQUECIMENTO NÃO É GAVETA. Enriquecer é achar a linha que já existe no
 * extrato e completar os campos dela: a linha do arquivo é, por definição,
 * DUPLICADA de algo que já está na base. Por isso `enriquecer()` incrementa
 * `duplicadas` e `enriquecidas` juntos — `enriquecidas` é métrica de qualidade,
 * não parcela da conta.
 */

/** Motivos de descarte. Chaves curtas, estáveis, snake_case. */
export type MotivoDescarte =
  | "cabecalho"
  | "rodape"
  | "linha_de_saldo"
  | "linha_vazia"
  | "fora_do_periodo"
  | "fora_do_escopo"
  | "sem_valor"
  | "boleto_em_aberto"
  | "sem_data"
  | "sem_identificador"
  | "sem_par_no_extrato"
  | "nao_parseavel"
  | "outro";

export const MOTIVO_ROTULO: Record<MotivoDescarte, string> = {
  cabecalho: "Cabeçalho do arquivo",
  rodape: "Rodapé / totalizador",
  linha_de_saldo: "Linha de saldo (vai para saldo diário)",
  linha_vazia: "Linha vazia",
  fora_do_periodo: "Fora do período importado",
  fora_do_escopo: "Fora do escopo desta fonte",
  sem_valor: "Sem valor",
  // BOLETO-ABERTO-NAO-E-DESCARTE (02/09/2026): a Francesinha traz a carteira
  // inteira, aberta e liquidada. Boleto aberto tem valor_pago = 0 e nao tem o
  // que enriquecer — nao e falha. Antes caia em `sem_valor` e 32 de 35 linhas
  // apareciam como "ignoradas", indistinguiveis de um arquivo que quebrou.
  // `sem_valor` fica reservado para onde valor zero e REALMENTE estranho
  // (ajuste SafraPay Tipo 3 de R$ 0,00).
  boleto_em_aberto: "Boleto em aberto (nada a conciliar)",
  sem_data: "Sem data",
  sem_identificador: "Sem identificador (NSU / ID de operação)",
  sem_par_no_extrato: "Sem par no extrato para enriquecer",
  nao_parseavel: "Não parseável",
  outro: "Outro",
};

export class ContagemImportacao {
  lidas = 0;
  novas = 0;
  duplicadas = 0;
  enriquecidas = 0;
  ignoradas = 0;
  readonly detalhe: Record<string, number> = {};

  /** Total de linhas que o parser leu do arquivo. */
  ler(n: number) {
    this.lidas = n;
  }

  nova(n = 1) {
    this.novas += n;
  }

  duplicada(n = 1) {
    this.duplicadas += n;
  }

  /** Linha do arquivo que só completou uma linha já existente do extrato. */
  enriquecer(n = 1) {
    this.duplicadas += n;
    this.enriquecidas += n;
  }

  /** Linha lida e descartada DE PROPÓSITO — sempre com motivo. */
  ignorar(motivo: MotivoDescarte, n = 1) {
    this.ignoradas += n;
    this.detalhe[motivo] = (this.detalhe[motivo] ?? 0) + n;
  }

  get contabilizadas() {
    return this.novas + this.duplicadas + this.ignoradas;
  }

  get diferenca() {
    return this.lidas - this.contabilizadas;
  }

  fecha() {
    return this.diferenca === 0;
  }

  /** "47 lidas = 12 novas + 28 duplicadas + 7 ignoradas" */
  resumo() {
    return (
      `${this.lidas} lidas = ${this.novas} novas + ${this.duplicadas} duplicadas` +
      ` + ${this.ignoradas} ignoradas`
    );
  }

  /** Texto de FAIL-LOUD para `erro_detalhe` quando a conta não fecha. */
  erroContaAberta() {
    const d = this.diferenca;
    const lado = d > 0 ? "sem explicação" : "contabilizadas a mais";
    return (
      `conta não fecha: ${this.lidas} lidas, ${this.novas} novas, ` +
      `${this.duplicadas} duplicadas, ${this.ignoradas} ignoradas, ` +
      `${Math.abs(d)} ${lado}.` +
      (this.ignoradas > 0 ? ` Motivos declarados: ${JSON.stringify(this.detalhe)}.` : "")
    );
  }
}
