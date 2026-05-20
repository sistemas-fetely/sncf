/**
 * Handler de Faturas de Cartão.
 *
 * Fluxo:
 * 1. Parser CSV ou PDF gera FaturaParsed
 * 2. Usuário revisa preview
 * 3. Chama salvarFaturaCartao() que:
 *    - Faz upload do PDF/CSV no bucket faturas-cartao
 *    - Cria registro em faturas_cartao
 *    - Cria N registros em fatura_cartao_lancamentos
 *    - Cria 1 conta_pagar_receber vinculada (a fatura como conta a pagar)
 */
import { supabase } from "@/integrations/supabase/client";
import type { FaturaParsed, LancamentoFaturaParsed } from "./parser-fatura-cartao";

const BUCKET = "faturas-cartao";

export interface SalvarFaturaInput {
  parsed: FaturaParsed;
  cartao_id: string;               // FK de cartoes_credito (Modelo 3D)
  data_vencimento: string;         // o usuário pode ajustar
  arquivo_original?: File | null;  // PDF ou CSV original
  observacao?: string;
}

export interface SalvarFaturaResult {
  ok: boolean;
  fatura_id?: string;
  conta_pagar_id?: string;
  qtd_lancamentos?: number;
  compromissos_criados?: number;
  parcelas_previstas_criadas?: number;
  parcelas_pagas_marcadas?: number;
  erro?: string;
}

export async function salvarFaturaCartao(
  input: SalvarFaturaInput,
): Promise<SalvarFaturaResult> {
  const { parsed, cartao_id, data_vencimento, arquivo_original, observacao } = input;
  const loteId = crypto.randomUUID();

  try {
    // 1. Pegar usuário
    const { data: { user } } = await supabase.auth.getUser();

    // 2. Upload do arquivo (best-effort)
    let storagePath: string | null = null;
    let nomeOriginal: string | null = null;
    if (arquivo_original) {
      try {
        const ext = arquivo_original.name.split(".").pop() || "pdf";
        const nomeLimpo = arquivo_original.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `lote-${loteId}/${Date.now()}_${nomeLimpo}`;
        nomeOriginal = arquivo_original.name;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, arquivo_original, {
            contentType:
              ext.toLowerCase() === "csv"
                ? "text/csv"
                : ext.toLowerCase() === "pdf"
                  ? "application/pdf"
                  : "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          console.warn("Upload falhou:", upErr);
          storagePath = null;
        }
      } catch (e) {
        console.warn("Upload exception:", e);
      }
    }

    // 3. Buscar info do cartão — Modelo 3D (cartoes_credito)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cartao } = await (supabase as any)
      .from("cartoes_credito")
      .select("id, nome, bandeira, ultimos_digitos, conta_bancaria_id")
      .eq("id", cartao_id)
      .single();
    const cartaoLabel = cartao?.nome || "Cartão";

    // (Doutrina nova: fatura NÃO cria conta a pagar totalizadora.
    //  Lançamentos viram conta a pagar individualmente quando operador clica "Criar despesa".)
    const valorTotal = parsed.valor_total || calcularTotalLancamentos(parsed.lancamentos);

    // 5. Criar fatura
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: faturaCriada, error: errFatura } = await (supabase as any)
      .from("faturas_cartao")
      .insert({
        cartao_id,
        conta_bancaria_id: cartao?.conta_bancaria_id ?? null,
        periodo_inicio: parsed.periodo_inicio,
        periodo_fim: parsed.periodo_fim,
        data_emissao: parsed.data_emissao,
        data_vencimento,
        valor_total: valorTotal,
        valor_total_calculado: calcularTotalLancamentos(parsed.lancamentos),
        valor_pagamento_anterior: parsed.valor_pagamento_anterior,
        valor_saldo_atraso: parsed.valor_saldo_atraso || 0,
        numero_documento: parsed.numero_documento,
        status: "aberta",
        conta_pagar_id: null, // doutrina nova: fatura não nasce ligada a conta totalizadora
        pdf_storage_path: storagePath,
        pdf_nome_original: nomeOriginal,
        fonte_importacao: parsed.formato.startsWith("csv") ? "csv" : "pdf",
        importacao_lote_id: loteId,
        observacao: observacao || null,
        criado_por: user?.id || null,
      })
      .select("id")
      .single();

    if (errFatura) {
      throw new Error(`Erro ao criar fatura: ${errFatura.message}`);
    }
    const faturaId = faturaCriada.id as string;

    // 6. Criar lançamentos em batch
    const linhasLancamentos = parsed.lancamentos.map((l) => ({
      fatura_id: faturaId,
      data_compra: l.data_compra,
      descricao: l.descricao,
      descricao_normalizada: normalizar(l.descricao),
      valor: l.valor,
      parcela_atual: l.parcela_atual,
      parcela_total: l.parcela_total,
      tipo: l.tipo,
      natureza: l.natureza,
      moeda: l.moeda,
      valor_original: l.valor_original,
      cotacao: l.cotacao,
      estabelecimento_descricao: l.estabelecimento_descricao,
      estabelecimento_local: l.estabelecimento_local,
      ramo_estabelecimento: l.ramo_estabelecimento,
      num_autorizacao: l.num_autorizacao,
      cnpj_estabelecimento: l.cnpj_estabelecimento,
      parceiro_id: null,
      plano_contas_id: null,
      status: "pendente",
      linha_original_csv: l.linha_original_csv,
    }));

    let idsLancamentosCriados: string[] = [];
    if (linhasLancamentos.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lancsCriados, error: errLanc } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .insert(linhasLancamentos)
        .select("id");
      if (errLanc) {
        console.error("Erro ao criar lançamentos:", errLanc);
        // Não rollback aqui - fatura ja existe; usuário pode reprocessar
      } else {
        idsLancamentosCriados = (lancsCriados || []).map((x: { id: string }) => x.id);
      }
    }

    // === FASE B: DESATIVADA ===
    // Gerador automático de parcelas previstas foi desligado.
    // Só importa o que está no PDF. Próximas parcelas chegam mês a mês na fatura.
    const resultadoCompromissos = {
      compromissos_criados: 0,
      parcelas_previstas_criadas: 0,
      parcelas_pagas_marcadas: 0,
    };

    // === FASE C: enriquecer CNPJs dos lançamentos (auto) ===
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("pipeline_enriquecer_cartao");
    } catch (e) {
      console.warn("Falha não-bloqueante no enriquecimento de CNPJs:", e);
    }

    return {
      ok: true,
      fatura_id: faturaId,
      conta_pagar_id: undefined,
      qtd_lancamentos: linhasLancamentos.length,
      ...resultadoCompromissos,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("salvarFaturaCartao erro:", e);
    return { ok: false, erro: msg };
  }
}

/**
 * Calcula o total dos lançamentos (excluindo pagamentos).
 */
function calcularTotalLancamentos(lancamentos: LancamentoFaturaParsed[]): number {
  return lancamentos
    .filter((l) => l.tipo !== "pagamento")
    .reduce((s, l) => s + l.valor, 0);
}

function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Chama a edge function pra parsear PDF via IA.
 */
export async function parsearPDFFatura(file: File): Promise<FaturaParsed> {
  const formData = new FormData();
  formData.append("file", file);

  const { data, error } = await supabase.functions.invoke(
    "parse-fatura-cartao-pdf",
    {
      body: formData,
    },
  );

  if (error) {
    throw new Error(`Falha na IA: ${error.message || JSON.stringify(error)}`);
  }
  if (!data) {
    throw new Error("Edge function retornou vazio");
  }
  if (data.error) {
    throw new Error(`IA retornou erro: ${data.error} ${data.detail || ""}`);
  }

  // Mapear resposta da IA pra FaturaParsed
  return {
    formato: "pdf_itau",
    cartao_numero_final: data.cartao_numero_final || null,
    data_vencimento: data.data_vencimento || null,
    data_emissao: data.data_emissao || null,
    periodo_inicio: data.periodo_inicio || null,
    periodo_fim: data.periodo_fim || null,
    valor_total: typeof data.valor_total === "number" ? data.valor_total : null,
    valor_pagamento_anterior:
      typeof data.valor_pagamento_anterior === "number" ? data.valor_pagamento_anterior : null,
    valor_saldo_atraso: typeof data.valor_saldo_atraso === "number" ? data.valor_saldo_atraso : null,
    numero_documento: data.numero_documento || null,
    lancamentos: (data.lancamentos || []).map((l: Record<string, unknown>) => ({
      data_compra: (l.data_compra as string) || "",
      descricao: (l.descricao as string) || "",
      valor: typeof l.valor === "number" ? l.valor : 0,
      parcela_atual: extrairParcelaAtual(l.descricao as string),
      parcela_total: extrairParcelaTotal(l.descricao as string),
      tipo: classificarTipo(l.descricao as string, l.valor as number),
      natureza: l.natureza === "INTERNACIONAL" ? "INTERNACIONAL" : "NACIONAL",
      moeda: (l.moeda as string) || "BRL",
      valor_original: typeof l.valor_original === "number" ? l.valor_original : null,
      cotacao: typeof l.cotacao === "number" ? l.cotacao : null,
      estabelecimento_descricao: (l.descricao as string) || null,
      estabelecimento_local: (l.estabelecimento_local as string) || null,
      ramo_estabelecimento: (l.ramo_estabelecimento as string) || null,
      num_autorizacao: null,
      cnpj_estabelecimento: null,
      linha_original_csv: JSON.stringify(l),
      numero_cartao_mascarado: null,
    })),
    alertas: [],
  };
}

function extrairParcelaAtual(desc: string): number | null {
  const m = (desc || "").match(/\b(\d{1,2})\/(\d{1,2})\b/);
  return m ? parseInt(m[1]) : null;
}

function extrairParcelaTotal(desc: string): number | null {
  const m = (desc || "").match(/\b(\d{1,2})\/(\d{1,2})\b/);
  return m ? parseInt(m[2]) : null;
}

function classificarTipo(
  desc: string,
  valor: number,
): "compra" | "estorno" | "iof" | "encargo" | "pagamento" | "taxa" | "outro" {
  const d = (desc || "").toUpperCase();
  if (d.includes("PAGAMENTO EFETUADO")) return "pagamento";
  if (d.includes("IOF")) return "iof";
  if (d.includes("JUROS") || d.includes("MULTA") || d.includes("ENCARGOS")) return "encargo";
  if (d.includes("TARIFA") || d.includes("ANUIDADE")) return "taxa";
  if (valor < 0) return "estorno";
  return "compra";
}

/**
 * Descarta uma fatura inteira (e seus lançamentos via cascade) + arquivo.
 */
export async function descartarFatura(faturaId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fatura } = await (supabase as any)
    .from("faturas_cartao")
    .select("pdf_storage_path, conta_pagar_id")
    .eq("id", faturaId)
    .single();

  // Apaga arquivo
  if (fatura?.pdf_storage_path) {
    await supabase.storage.from(BUCKET).remove([fatura.pdf_storage_path]);
  }

  // Apaga conta a pagar
  if (fatura?.conta_pagar_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("contas_pagar_receber")
      .delete()
      .eq("id", fatura.conta_pagar_id);
  }

  // Apaga fatura (CASCADE apaga lançamentos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("faturas_cartao").delete().eq("id", faturaId);
}
