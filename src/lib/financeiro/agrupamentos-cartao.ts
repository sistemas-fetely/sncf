/**
 * Detecta agrupamentos N:1 entre contas a pagar e movimentações bancárias.
 * Caso clássico: fatura de cartão de crédito (1 débito no extrato) que cobre
 * várias compras (N contas a pagar) — também serve para SISPAG, lotes de boletos etc.
 *
 * Estratégia inteligente:
 *  1. Filtra movimentações que parecem fatura/lote (≥ R$ 100).
 *  2. Para cada fatura, monta janela de candidatas (±45d, ou 30d antes para cartão).
 *  3. Prioriza contas com forma_pagamento "Cartão" quando existirem.
 *  4. Agrupa candidatas por fornecedor (CNPJ ou nome) e testa combinações
 *     (power set até 20 grupos) buscando soma exata.
 *  5. Fallback: subset-sum greedy. Aceita apenas score ≥ 85.
 */

export type MovInput = {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number | string;
  conciliado?: boolean | null;
  tipo_pagamento?: string | null;
};

export type ContaInput = {
  id: string;
  data_vencimento: string;
  valor: number | string;
  descricao: string;
  fornecedor_cliente: string | null;
  status?: string;
  nf_cnpj_emitente?: string | null;
  is_cartao?: boolean | null;
};

export type AgrupamentoSugerido = {
  id: string;
  movimentacao: MovInput;
  contas: ContaInput[];
  valor_movimentacao: number;
  soma_contas: number;
  diferenca_percentual: number;
  score: number;
  motivo: string;
};

export type ValidacaoAgrupamento = {
  valido: boolean;
  soma: number;
  diferenca: number;
  percentual: number;
};

const TOLERANCIA_PCT = 1.0; // 1%
const JANELA_DIAS = 45;
const JANELA_CARTAO_DIAS = 30;
const MAX_FORNECEDORES_PARA_PSET = 20;

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function diasEntre(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs((da - db) / 86400000);
}

function difPercent(esperado: number, real: number): number {
  if (real === 0) return 100;
  return Math.abs((esperado - real) / real) * 100;
}

/**
 * Detecta se uma movimentação é fatura de cartão de crédito ou lote de pagamentos.
 */
function ehFaturaOuLote(mov: MovInput): boolean {
  const tipo = (mov.tipo_pagamento || "").toUpperCase();
  if (tipo.includes("FATURA") || tipo.includes("CARTAO") || tipo.includes("CARTÃO")) {
    return true;
  }
  const desc = (mov.descricao || "").toUpperCase();
  const padroes = [
    /SISPAG/,
    /FAT.*CART/,
    /FATURA.*CART/,
    /PAG.*TIT.*\d{11}/,
    /\b(VISA|MASTER|MASTERCARD|ELO|HIPERCARD|AMEX)\b/,
    /LOTE|REMESSA/,
  ];
  return padroes.some((p) => p.test(desc));
}

function ehContaCartao(c: ContaInput): boolean {
  return c.is_cartao === true;
}

function chaveFornecedor(c: ContaInput): string {
  return (
    c.nf_cnpj_emitente?.trim() ||
    c.fornecedor_cliente?.trim() ||
    c.descricao?.trim() ||
    "sem_fornecedor"
  );
}

/**
 * Score baseado em diferença percentual + bônus.
 * Rigoroso: só score alto com valores praticamente exatos.
 */
function calcularScoreBase(dif: number): number {
  if (dif <= 0.1) return 100; // praticamente exato
  if (dif <= 0.5) return 95;
  if (dif <= 1.0) return 85;
  return 0;
}

/**
 * Testa combinações por fornecedor (power set). Retorna a melhor combinação
 * com score ≥ 95, ou null.
 */
function tentarCombinacoesPorFornecedor(
  candidatas: ContaInput[],
  alvo: number,
): { contas: ContaInput[]; soma: number; dif: number; score: number; fornecedores: string[] } | null {
  const porFornecedor = new Map<string, ContaInput[]>();
  for (const c of candidatas) {
    const k = chaveFornecedor(c);
    if (!porFornecedor.has(k)) porFornecedor.set(k, []);
    porFornecedor.get(k)!.push(c);
  }

  const fornecedores = Array.from(porFornecedor.keys());
  if (fornecedores.length === 0 || fornecedores.length > MAX_FORNECEDORES_PARA_PSET) {
    return null;
  }

  const totalCombs = 1 << fornecedores.length;
  let melhor: { contas: ContaInput[]; soma: number; dif: number; score: number; fornecedores: string[] } | null = null;

  for (let mask = 1; mask < totalCombs; mask++) {
    const usados: string[] = [];
    const contas: ContaInput[] = [];
    let soma = 0;
    for (let j = 0; j < fornecedores.length; j++) {
      if (mask & (1 << j)) {
        const f = fornecedores[j];
        usados.push(f);
        for (const c of porFornecedor.get(f)!) {
          contas.push(c);
          soma += num(c.valor);
        }
      }
    }
    const dif = difPercent(alvo, soma);
    if (dif > TOLERANCIA_PCT) continue;
    const base = calcularScoreBase(dif);
    if (base < 95) continue;
    const score = Math.min(99, base + Math.min(usados.length * 2, 10));
    if (!melhor || score > melhor.score) {
      melhor = { contas, soma, dif, score, fornecedores: usados };
    }
  }

  return melhor;
}

/**
 * Subset-sum greedy (fallback). Bom o suficiente quando agrupamento por
 * fornecedor não encontra match exato.
 */
function buscarCombinacaoGreedy(
  candidatas: ContaInput[],
  alvo: number,
): ContaInput[] | null {
  const ordenadas = [...candidatas].sort((a, b) => num(b.valor) - num(a.valor));
  const escolhidas: ContaInput[] = [];
  let soma = 0;
  for (const c of ordenadas) {
    const v = num(c.valor);
    if (soma + v <= alvo * (1 + TOLERANCIA_PCT / 100)) {
      escolhidas.push(c);
      soma += v;
    }
    if (difPercent(soma, alvo) <= TOLERANCIA_PCT && escolhidas.length >= 2) {
      return escolhidas;
    }
  }
  return difPercent(soma, alvo) <= TOLERANCIA_PCT && escolhidas.length >= 2
    ? escolhidas
    : null;
}

/**
 * Monta motivo legível para a sugestão.
 */
function montarMotivo(contas: ContaInput[], desc: string, fornecedoresUsados?: string[]): string {
  if (fornecedoresUsados && fornecedoresUsados.length > 0) {
    const nomes = fornecedoresUsados
      .map((f) => f.split(" ")[0].slice(0, 18))
      .slice(0, 3)
      .join(", ");
    const sufixo = fornecedoresUsados.length > 3 ? ` +${fornecedoresUsados.length - 3}` : "";
    return `${contas.length} compra${contas.length > 1 ? "s" : ""} (${nomes}${sufixo})`;
  }
  if (/CARTAO|CARTÃO|FATURA|VISA|MASTER|ELO/.test(desc)) return "fatura de cartão";
  if (/SISPAG|LOTE|REMESSA/.test(desc)) return "lote de pagamentos";
  return "soma compatível";
}

export function encontrarAgrupamentosCartao(
  movs: MovInput[],
  contas: ContaInput[],
): AgrupamentoSugerido[] {
  const sugestoes: AgrupamentoSugerido[] = [];
  const contasUsadas = new Set<string>();

  const debitos = movs
    .filter((m) => num(m.valor) < 0 && Math.abs(num(m.valor)) >= 100 && ehFaturaOuLote(m))
    .sort((a, b) => Math.abs(num(b.valor)) - Math.abs(num(a.valor)));

  for (const mov of debitos) {
    const valorAlvo = Math.abs(num(mov.valor));
    const desc = (mov.descricao || "").toUpperCase();

    // Janela: 30 dias antes (cartão típico) — usa JANELA_DIAS como fallback amplo
    const candidatasBase = contas.filter((c) => {
      if (contasUsadas.has(c.id)) return false;
      if (c.status === "conciliado" || c.status === "cancelado") return false;
      return diasEntre(mov.data_transacao, c.data_vencimento) <= JANELA_DIAS;
    });

    if (candidatasBase.length < 2) continue;

    // Janela estreita preferencial (cartão) + filtro por forma de pagamento
    const candidatasCartao = candidatasBase.filter(
      (c) => ehContaCartao(c) && diasEntre(mov.data_transacao, c.data_vencimento) <= JANELA_CARTAO_DIAS,
    );
    const candidatas = candidatasCartao.length >= 2 ? candidatasCartao : candidatasBase;

    // Estratégia 1: combinações inteligentes por fornecedor
    const combFornecedor = tentarCombinacoesPorFornecedor(candidatas, valorAlvo);

    let escolha:
      | { contas: ContaInput[]; soma: number; dif: number; score: number; fornecedores?: string[] }
      | null = null;

    if (combFornecedor) {
      escolha = combFornecedor;
    } else {
      // Estratégia 2: greedy
      const greedy = buscarCombinacaoGreedy(candidatas, valorAlvo);
      if (greedy) {
        const soma = greedy.reduce((s, c) => s + num(c.valor), 0);
        const dif = difPercent(valorAlvo, soma);
        let score = calcularScoreBase(dif);
        if (score === 0) continue;
        if (/CARTAO|CARTÃO|FATURA|VISA|MASTER|ELO/.test(desc)) score += 5;
        else if (/SISPAG|LOTE|REMESSA/.test(desc)) score += 3;
        if (greedy.length >= 3) score += 2;
        if (score < 85) continue;
        escolha = { contas: greedy, soma, dif, score: Math.min(score, 99) };
      }
    }

    if (!escolha) continue;

    sugestoes.push({
      id: `agrup_${mov.id}`,
      movimentacao: mov,
      contas: escolha.contas,
      valor_movimentacao: valorAlvo,
      soma_contas: escolha.soma,
      diferenca_percentual: escolha.dif,
      score: escolha.score,
      motivo: montarMotivo(escolha.contas, desc, escolha.fornecedores),
    });

    escolha.contas.forEach((c) => contasUsadas.add(c.id));
  }

  return sugestoes.sort((a, b) => b.score - a.score);
}

/**
 * Valida em tempo real se uma seleção manual de contas bate com a movimentação.
 */
export function validarAgrupamento(
  contaIds: string[],
  todasContas: ContaInput[],
  valorMovimentacao: number,
): ValidacaoAgrupamento {
  const selecionadas = todasContas.filter((c) => contaIds.includes(c.id));
  const soma = selecionadas.reduce((s, c) => s + num(c.valor), 0);
  const valorAbs = Math.abs(valorMovimentacao);
  const diferenca = Math.abs(soma - valorAbs);
  const percentual = valorAbs > 0 ? (diferenca / valorAbs) * 100 : 100;
  return {
    valido: percentual <= TOLERANCIA_PCT,
    soma,
    diferenca,
    percentual,
  };
}
