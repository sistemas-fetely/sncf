/**
 * Handler de Compromissos Parcelados.
 *
 * Conceito: uma compra parcelada (cartão ou manual) é UM compromisso
 * que GERA N contas a pagar (uma por parcela mensal).
 *
 * Fluxo principal:
 * 1. Ao importar fatura de cartão, identifica linhas com "X/Y" (parcela atual / total)
 * 2. Pra cada compra parcelada inédita, cria 1 compromisso_parcelado + N parcelas previstas (futuras)
 * 3. Pra cada compra parcelada que já tem compromisso, marca a parcela atual como "enviado_para_pagamento"
 * 4. Resultado: você importa fatura mês 2 → vê parcelas 3..10 já no fluxo de caixa
 */
import { supabase } from "@/integrations/supabase/client";
import type { LancamentoFaturaParsed } from "./parser-fatura-cartao";

/**
 * Normaliza descrição pra match. Remove acentos, parcela, lowercase.
 */
function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remover indicador de parcela
    .replace(/\s+\d{1,2}\/\d{1,2}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula a data prevista de uma parcela específica.
 * Assume parcelas mensais a partir da data_primeira_parcela.
 */
function calcularDataParcela(dataPrimeira: string, numeroParcela: number): string {
  const [yyyy, mm, dd] = dataPrimeira.split("-").map(Number);
  // Mês 0-based no Date
  const d = new Date(yyyy, mm - 1 + (numeroParcela - 1), dd);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Subtrai meses de uma data ISO.
 * Usado pra estimar quando foi a "primeira parcela" de uma compra que veio com "02/10" (pulamos 1 mês atrás).
 */
function subtrairMeses(dataISO: string, qtdMeses: number): string {
  const [yyyy, mm, dd] = dataISO.split("-").map(Number);
  const d = new Date(yyyy, mm - 1 - qtdMeses, dd);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CompromissoExistente {
  id: string;
  descricao_normalizada: string | null;
  qtd_parcelas: number;
  valor_parcela: number;
  parcelas_pagas: number;
  data_primeira_parcela: string;
}

/**
 * Busca um compromisso existente que combine com a descrição+valor+qtd_parcelas.
 * Tolerância de centavos no valor (até R$ 0,02).
 */
async function buscarCompromissoExistente(
  descricaoNorm: string,
  valor: number,
  qtdParcelas: number,
): Promise<CompromissoExistente | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("compromissos_parcelados")
    .select("id, descricao_normalizada, qtd_parcelas, valor_parcela, parcelas_pagas, data_primeira_parcela")
    .eq("descricao_normalizada", descricaoNorm)
    .eq("qtd_parcelas", qtdParcelas)
    .eq("status", "ativo");

  if (!data || data.length === 0) return null;

  // Filtrar por valor próximo
  const match = (data as CompromissoExistente[]).find(
    (c) => Math.abs(c.valor_parcela - valor) < 0.02,
  );
  return match || null;
}

interface ResultadoProcessamento {
  compromissos_criados: number;
  parcelas_previstas_criadas: number;
  parcelas_pagas_marcadas: number;
  erros: string[];
}

/**
 * Processa lançamentos da fatura, identificando os parcelados.
 * Para cada compra parcelada inédita, cria compromisso + parcelas previstas.
 * Para cada compra parcelada com compromisso existente, marca essa parcela como paga.
 */
export async function processarParcelasDaFatura(
  faturaId: string,
  lancamentos: LancamentoFaturaParsed[],
  idsLancamentosCriados: string[], // ids dos fatura_cartao_lancamentos recém-criados
): Promise<ResultadoProcessamento> {
  const resultado: ResultadoProcessamento = {
    compromissos_criados: 0,
    parcelas_previstas_criadas: 0,
    parcelas_pagas_marcadas: 0,
    erros: [],
  };

  // Filtrar só lançamentos com parcelas (X/Y) que sejam compras
  const parcelados = lancamentos
    .map((l, idx) => ({ l, lancId: idsLancamentosCriados[idx] }))
    .filter(({ l }) => l.parcela_atual && l.parcela_total && l.tipo === "compra");

  if (parcelados.length === 0) return resultado;

  const { data: { user } } = await supabase.auth.getUser();

  for (const { l } of parcelados) {
    try {
      const descNorm = normalizar(l.descricao);
      if (!descNorm) continue;

      const compromissoExistente = await buscarCompromissoExistente(
        descNorm,
        Math.abs(l.valor),
        l.parcela_total!,
      );

      if (compromissoExistente) {
        // === CASO 1: Compromisso já existe (ex: importou fatura de mar antes, agora abr) ===
        // Marca a parcela_atual como paga (era prevista)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errUpd } = await (supabase as any)
          .from("contas_pagar_receber")
          .update({
            status: "enviado_para_pagamento",
            data_pagamento: l.data_compra,
            // Não vou mexer em compromisso_parcelado_id porque já está vinculado
          })
          .eq("compromisso_parcelado_id", compromissoExistente.id)
          .eq("numero_parcela", l.parcela_atual)
          .eq("status", "previsto");

        if (!errUpd) {
          resultado.parcelas_pagas_marcadas++;
        }

        // Atualizar contagem no compromisso
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("compromissos_parcelados")
          .update({
            parcelas_pagas: compromissoExistente.parcelas_pagas + 1,
            parcelas_previstas: Math.max(
              0,
              (compromissoExistente.qtd_parcelas - compromissoExistente.parcelas_pagas - 1),
            ),
          })
          .eq("id", compromissoExistente.id);
      } else {
        // === CASO 2: Compromisso novo (1ª vez vendo essa compra) ===
        // Cria compromisso + parcelas FUTURAS (parcela_atual+1 até parcela_total)

        // Estimar data da primeira parcela: subtrai (parcela_atual - 1) meses da data atual
        const dataPrimeiraParcela = subtrairMeses(l.data_compra, (l.parcela_atual || 1) - 1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: novoComp, error: errNovo } = await (supabase as any)
          .from("compromissos_parcelados")
          .insert({
            descricao: l.descricao.replace(/\s+\d{1,2}\/\d{1,2}\s*$/, "").trim(),
            descricao_normalizada: descNorm,
            origem: "cartao",
            valor_total: Math.abs(l.valor) * (l.parcela_total || 1),
            qtd_parcelas: l.parcela_total,
            valor_parcela: Math.abs(l.valor),
            data_compra: l.data_compra,
            data_primeira_parcela: dataPrimeiraParcela,
            status: "ativo",
            parcelas_pagas: l.parcela_atual || 1, // a parcela atual + as anteriores (perdidas)
            parcelas_previstas: 0,
            fatura_origem_id: faturaId,
            criado_por: user?.id || null,
          })
          .select("id")
          .single();

        if (errNovo) {
          resultado.erros.push(`Erro ao criar compromisso "${l.descricao}": ${errNovo.message}`);
          continue;
        }

        resultado.compromissos_criados++;

        // Criar parcelas FUTURAS (da parcela_atual+1 até parcela_total)
        const parcelaInicial = (l.parcela_atual || 0) + 1;
        const parcelaFinal = l.parcela_total || 0;

        if (parcelaInicial <= parcelaFinal) {
          // Chamar a função SQL gerar_parcelas_previstas
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: qtdCriadas, error: errParcelas } = await (supabase as any).rpc(
            "gerar_parcelas_previstas",
            {
              p_compromisso_id: novoComp.id,
              p_parcela_inicial: parcelaInicial,
              p_parcela_final: parcelaFinal,
            },
          );

          if (errParcelas) {
            resultado.erros.push(
              `Erro ao gerar parcelas previstas de "${l.descricao}": ${errParcelas.message}`,
            );
          } else if (typeof qtdCriadas === "number") {
            resultado.parcelas_previstas_criadas += qtdCriadas;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resultado.erros.push(msg);
    }
  }

  return resultado;
}

/**
 * Cancela um compromisso parcelado e suas parcelas previstas.
 * Útil pra estornos / cancelamento de compra parcelada.
 */
export async function cancelarCompromisso(compromissoId: string): Promise<void> {
  // 1. Marcar todas as parcelas previstas como canceladas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("contas_pagar_receber")
    .update({ status: "cancelado" })
    .eq("compromisso_parcelado_id", compromissoId)
    .eq("status", "previsto");

  // 2. Marcar compromisso como cancelado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("compromissos_parcelados")
    .update({ status: "cancelado" })
    .eq("id", compromissoId);
}
