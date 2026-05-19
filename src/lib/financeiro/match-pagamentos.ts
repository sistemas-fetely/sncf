/**
 * Tenta vincular NFs importadas a pagamentos já existentes no sistema (sem NF).
 * Critério de match: CNPJ/nome + valor + data de vencimento.
 * Score >= 60 vincula. Cada conta só matcheia com UMA NF.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NFParsed } from "./types";

interface ContaMatch {
  id: string;
  valor: number;
  data_vencimento: string | null;
  nf_cnpj_emitente: string | null;
  nf_chave_acesso: string | null;
  nf_numero: string | null;
  fornecedor_cliente: string | null;
  status: string;
  docs_status: string | null;
  plano_contas_id: string | null;
  _usado?: boolean;
}

export async function buscarMatchPagamentos(nfs: NFParsed[]): Promise<NFParsed[]> {
  const cnpjs = nfs
    .map((nf) => (nf.fornecedor_cnpj || "").replace(/[^\d]/g, ""))
    .filter((c) => c.length > 0);

  // Buscar contas a pagar SEM NF vinculada (com CNPJ)
  // Importante: SEM nf_numero também (evita vincular NF nova em conta que já tem outra NF)
  let contasPorCnpj: ContaMatch[] = [];
  if (cnpjs.length > 0) {
    const { data } = await supabase
      .from("contas_pagar_receber")
      .select(
        "id, valor, data_vencimento, nf_cnpj_emitente, nf_chave_acesso, nf_numero, fornecedor_cliente, status, docs_status, plano_contas_id",
      )
      .eq("tipo", "pagar")
      .is("nf_chave_acesso", null)
      .is("nf_numero", null)
      .in("nf_cnpj_emitente", cnpjs)
      .neq("status", "cancelado");
    contasPorCnpj = (data || []) as ContaMatch[];
  }

  // Buscar contas SEM CNPJ e SEM NF (match por nome+valor)
  const { data: dataSemCnpj } = await supabase
    .from("contas_pagar_receber")
    .select(
      "id, valor, data_vencimento, nf_cnpj_emitente, nf_chave_acesso, nf_numero, fornecedor_cliente, status, docs_status, plano_contas_id",
    )
    .eq("tipo", "pagar")
    .is("nf_chave_acesso", null)
    .is("nf_numero", null)
    .is("nf_cnpj_emitente", null)
    .neq("status", "cancelado");

  const todasContas: ContaMatch[] = [
    ...contasPorCnpj,
    ...((dataSemCnpj || []) as ContaMatch[]),
  ];

  if (todasContas.length === 0) return nfs;

  // Pra cada NF (em ordem do CSV), encontrar melhor match
  return nfs.map((nf) => {
    if (nf._duplicata) return nf;
    const match = encontrarMatchPagamento(nf, todasContas);
    if (match) {
      return { ...nf, _match_pagamento: match };
    }
    return nf;
  });
}

function encontrarMatchPagamento(
  nf: NFParsed,
  contas: ContaMatch[],
): NFParsed["_match_pagamento"] | null {
  const cnpjNf = (nf.fornecedor_cnpj || "").replace(/[^\d]/g, "");
  const valorNf = Number(nf.valor) || 0;
  const dataNf = nf.nf_data_emissao;

  let melhor: { conta: ContaMatch; score: number } | null = null;

  for (const conta of contas) {
    if (conta._usado) continue;

    const cnpjConta = (conta.nf_cnpj_emitente || "").replace(/[^\d]/g, "");
    let score = 0;

    // Match por CNPJ ou nome
    if (cnpjNf && cnpjConta && cnpjNf === cnpjConta) {
      score += 40;
    } else if (conta.fornecedor_cliente && nf.fornecedor_nome) {
      const nomeNf = (nf.fornecedor_nome || "").toLowerCase().trim().split(/\s+/)[0];
      const nomeConta = (conta.fornecedor_cliente || "").toLowerCase().trim().split(/\s+/)[0];
      if (nomeNf.length > 3 && nomeConta.length > 3 && nomeNf === nomeConta) {
        score += 25;
      }
    }

    // Match por valor (tolerância)
    const diffValor = Math.abs(valorNf - Number(conta.valor || 0));
    if (diffValor === 0) score += 40;
    else if (diffValor <= 1.0) score += 30;
    else if (diffValor <= 10.0) score += 15;

    // Match por data (tolerância em dias)
    if (dataNf && conta.data_vencimento) {
      const d1 = new Date(dataNf).getTime();
      const d2 = new Date(conta.data_vencimento).getTime();
      if (!isNaN(d1) && !isNaN(d2)) {
        const diffDias = Math.abs(Math.ceil((d1 - d2) / 86400000));
        if (diffDias <= 3) score += 20;
        else if (diffDias <= 7) score += 10;
      }
    }

    if (score >= 60 && (!melhor || score > melhor.score)) {
      melhor = { conta, score };
    }
  }

  if (!melhor) return null;

  melhor.conta._usado = true;
  return {
    conta_id: melhor.conta.id,
    score: melhor.score,
    conta_descricao: `${melhor.conta.fornecedor_cliente || "—"} — R$ ${Number(melhor.conta.valor || 0).toFixed(2)}`,
    conta_status: melhor.conta.status,
    conta_docs_status: melhor.conta.docs_status,
    conta_plano_contas_id: melhor.conta.plano_contas_id,
  };
}
