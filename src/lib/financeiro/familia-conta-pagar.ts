/**
 * Helper: classifica conta a pagar em FAMÍLIA (3 comportamentos) e
 * derruba toda a lógica de visibilidade de campos + regra do ícone email
 * em um lugar só.
 *
 * Refactor M2 (16/05/2026 — Doutrinas #89 e #90):
 *
 * - is_cartao FOI ABOLIDO da tabela. Agora a fonte de verdade é meio_pagamento.
 *   Família B = meio_codigo === 'fatura_cartao'.
 *
 * - FORMAS_QUE_COBRAM_EMAIL FOI ABOLIDO (era hardcode, violava Doutrina #07).
 *   Agora getRegraIconeEmail recebe forma_cobra_email: boolean direto.
 *   A flag mora em formas_pagamento.cobra_email — quem chama traz no JOIN.
 */

export type FamiliaContaPagar =
  | "A_a_pagar"
  | "B_cartao"
  | "C_ja_saiu";

export type VisibilidadeCampo = "editar" | "obrigatorio" | "readonly" | "oculto";

export type CampoConta =
  | "descricao"
  | "data_vencimento"
  | "categoria"
  | "centro_custo"
  | "forma_pagamento_id"
  | "pago_em_conta"
  | "nf_numero_serie"
  | "nf_chave"
  | "observacao";

export type MapaCamposVisiveis = Record<CampoConta, VisibilidadeCampo>;

export type RegraIconeEmail = "verde" | "vermelho" | "cinza";

export type ContaParaFamilia = {
  meio_codigo: string | null;
  origem: string | null;
};

export type ContaParaIconeEmail = {
  familia: FamiliaContaPagar;
  forma_cobra_email: boolean | null;
  status: string;
  email_pagamento_enviado: boolean | null;
};

export function getFamiliaContaPagar(conta: ContaParaFamilia): FamiliaContaPagar {
  if (conta.meio_codigo === "fatura_cartao") return "B_cartao";
  if (conta.origem === "extrato") return "C_ja_saiu";
  if (conta.meio_codigo === "nascida_paga") return "C_ja_saiu";
  return "A_a_pagar";
}

const STATUS_TERMINAIS = ["enviado_para_pagamento", "cancelado"];
const STATUS_PRE_PAGAMENTO = ["aprovado", "enviado_para_pagamento"];

export function getCamposVisiveis(
  familia: FamiliaContaPagar,
  status: string,
): MapaCamposVisiveis {
  const terminal = STATUS_TERMINAIS.includes(status);
  const prePagamento = STATUS_PRE_PAGAMENTO.includes(status);

  if (terminal) {
    return {
      descricao: "readonly",
      data_vencimento: "readonly",
      categoria: "readonly",
      centro_custo: "readonly",
      forma_pagamento_id: "readonly",
      pago_em_conta: "readonly",
      nf_numero_serie: "readonly",
      nf_chave: "readonly",
      observacao: "readonly",
    };
  }

  if (familia === "B_cartao") {
    return {
      descricao: "editar",
      data_vencimento: "readonly",
      categoria: "editar",
      centro_custo: "editar",
      forma_pagamento_id: "readonly",
      pago_em_conta: "readonly",
      nf_numero_serie: "editar",
      nf_chave: "oculto",
      observacao: "editar",
    };
  }

  if (familia === "C_ja_saiu") {
    return {
      descricao: "editar",
      data_vencimento: "readonly",
      categoria: "editar",
      centro_custo: "editar",
      forma_pagamento_id: "readonly",
      pago_em_conta: "readonly",
      nf_numero_serie: "editar",
      nf_chave: "oculto",
      observacao: "editar",
    };
  }

  return {
    descricao: "editar",
    data_vencimento: "editar",
    categoria: "editar",
    centro_custo: "editar",
    forma_pagamento_id: "editar",
    pago_em_conta: prePagamento ? "obrigatorio" : "editar",
    nf_numero_serie: "editar",
    nf_chave: "oculto",
    observacao: "editar",
  };
}

export function getRegraIconeEmail(input: ContaParaIconeEmail): RegraIconeEmail {
  if (input.email_pagamento_enviado === true) return "verde";
  if (input.familia !== "A_a_pagar") return "cinza";
  if (STATUS_TERMINAIS.includes(input.status)) return "cinza";
  if (input.forma_cobra_email === true) return "vermelho";
  return "cinza";
}
