import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function formatDateBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

interface LinhaRetorno {
  ocorrencia: string;
  seuNumero: string;
  nossoNumero: string;
  motivoRejeicao: string;
}

function parseLinha(linha: string): LinhaRetorno | null {
  if (linha.length < 400 || linha[0] !== "1") return null;
  // Nosso número nas posições 63-71 (este offset já estava correto).
  // Normaliza zeros à esquerda para casar com nosso_numero_seq (gravado sem padding no banco).
  const nnRaw = linha.substring(62, 71).trim();
  return {
    nossoNumero: nnRaw.replace(/^0+/, "") || nnRaw,
    motivoRejeicao: linha.substring(104, 107).trim(), // NÃO validado p/ rejeição — manter como está por ora
    ocorrencia:     linha.substring(108, 110).trim(), // 109-110 (correto)
    seuNumero:      linha.substring(116, 126).trim(), // CORRIGIDO: 117-126 (número do doc no RETORNO) — uso só p/ log/exibição
  };
}

const OCORRENCIA_CONFIRMADA  = "02";
const OCORRENCIAS_LIQUIDACAO = ["06", "09"];
const OCORRENCIAS_REJEICAO   = ["03", "15", "16", "17"];

const MOTIVOS_REJEICAO: Record<string, string> = {
  "001": "Código do banco inválido",
  "004": "Código de movimento inválido",
  "007": "Agência/conta inválida",
  "008": "Nosso número inválido",
  "010": "Carteira não cadastrada",
  "015": "CNPJ/CPF do pagador inválido",
  "016": "Agência cobradora inválida",
  "017": "CEP do pagador inválido",
  "018": "Data de vencimento inválida",
  "021": "Espécie inválida",
  "022": "Data de emissão inválida",
  "060": "Movimento inválido para carteira",
};

function descricaoRejeicao(codigo: string): string {
  return MOTIVOS_REJEICAO[codigo] ?? `Código de rejeição ${codigo}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sbUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const arquivoConteudo: string = body.arquivo_conteudo ?? "";
    if (!arquivoConteudo) {
      return new Response(JSON.stringify({ ok: false, erro: "arquivo_conteudo é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const linhas   = arquivoConteudo.split(/\r?\n/).filter((l) => l.length >= 400);
    const detalhes = linhas.map(parseLinha).filter((l): l is LinhaRetorno => l !== null);
    if (detalhes.length === 0) {
      return new Response(JSON.stringify({ ok: false, erro: "Nenhuma linha de detalhe encontrada" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const headerLinha = linhas.find((l) => l[0] === "0");
    let remessaId: string | null = null;
    if (headerLinha && headerLinha.length >= 394) {
      const nroSeq = parseInt(headerLinha.substring(391, 394).trim(), 10);
      if (!isNaN(nroSeq)) {
        const { data: remessa } = await sb.from("remessas_safra").select("id").eq("nro_sequencial", nroSeq).maybeSingle();
        remessaId = (remessa as { id: string } | null)?.id ?? null;
      }
    }

    // PB-1: Buscar conta bancária Safra (banco_codigo 422) — usada nos registros de movimentação
    const { data: safraConta } = await sb
      .from("contas_bancarias")
      .select("id")
      .eq("banco_codigo", "422")
      .eq("ativo", true)
      .maybeSingle();

    if (!safraConta) {
      console.warn("[retorno-safra] Conta bancária Safra (422) não encontrada — movimentacoes_bancarias não serão gravadas");
    }

    let confirmados = 0, rejeitados = 0, liquidados = 0, emailsEnviados = 0;
    const detalhesRejeicao: Array<{ numero_titulo: string; parceiro_nome: string; codigo_rejeicao: string; motivo: string }> = [];

    for (const linha of detalhes) {
      const { data: titulo, error: tErr } = await sb
        .from("titulo_a_receber")
        .select(`
          id, numero_titulo, numero_parcela, total_parcelas,
          valor_bruto, data_vencimento_atual, boleto_status, pedido_id,
          nosso_numero_seq, linha_digitavel, codigo_barras_boleto,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(razao_social, email)
          )
        `)
        .eq("nosso_numero_seq", linha.nossoNumero)
        .maybeSingle();

      if (tErr || !titulo) {
        console.warn(`[retorno-safra] Título não encontrado: nossoNumero=${linha.nossoNumero} seuNumero=${linha.seuNumero}`);
        continue;
      }

      // deno-lint-ignore no-explicit-any
      const t = titulo as any;
      const parceiro = t.conta?.parceiro;

      // ── Ocorrência 02: Registro confirmado ────────────────────────────────
      if (linha.ocorrencia === OCORRENCIA_CONFIRMADA) {
        await sb.from("titulo_a_receber").update({ boleto_status: "registrado" }).eq("id", t.id);
        confirmados++;

        if (parceiro?.email) {
          try {
            let pdfBase64: string | null = null;
            let nomeArquivo = `boleto_${t.nosso_numero_seq ?? t.numero_titulo}.pdf`;

            if (t.nosso_numero_seq && t.linha_digitavel && t.codigo_barras_boleto) {
              const pdfResp = await fetch(`${supabaseUrl}/functions/v1/gerar-boleto-pdf`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: anonKey },
                body: JSON.stringify({ titulo_id: t.id }),
              });
              if (pdfResp.ok) {
                const pdfData = await pdfResp.json();
                pdfBase64 = pdfData.pdf_base64 ?? null;
                nomeArquivo = pdfData.nome_arquivo ?? nomeArquivo;
              }
            }

            const attachments = pdfBase64
              ? [{ filename: nomeArquivo, content: pdfBase64, content_type: "application/pdf" }]
              : [];

            const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: anonKey },
              body: JSON.stringify({
                templateName: "boleto-safra",
                recipientEmail: parceiro.email,
                idempotencyKey: `boleto-${t.id}-reg`,
                templateData: {
                  parceiro_nome:     parceiro.razao_social ?? "—",
                  numero_parcela:    String(t.numero_parcela),
                  total_parcelas:    String(t.total_parcelas),
                  valor:             formatBRL(Number(t.valor_bruto)),
                  vencimento:        formatDateBR(t.data_vencimento_atual),
                  linha_digitavel:   t.linha_digitavel ?? "—",
                  pedido_id_externo: t.numero_titulo ?? "—",
                },
                attachments,
              }),
            });

            if (emailResp.ok) {
              await sb.from("titulo_a_receber").update({ boleto_enviado_em: new Date().toISOString() }).eq("id", t.id);
              emailsEnviados++;
            }
          } catch (emailErr) {
            console.error(`[retorno-safra] Erro email/pdf título ${t.id}`, emailErr);
          }
        }

      // ── Ocorrências 06/09: Liquidação ─────────────────────────────────────
      } else if (OCORRENCIAS_LIQUIDACAO.includes(linha.ocorrencia)) {

        if (t.boleto_status === "pago_manual") {
          console.log(`[retorno-safra] Título ${t.id} já pago_manual — ocorrência ${linha.ocorrencia} ignorada`);
          liquidados++;
          continue;
        }

        const agora = new Date().toISOString();

        // 1. marcar_titulo_pago: status='pago' + cascade CPR
        const { error: errMarca } = await sb.rpc("marcar_titulo_pago" as string, {
          p_titulo_id: t.id,
          p_data_pagamento: agora,
        });
        if (errMarca) {
          console.error(`[retorno-safra] marcar_titulo_pago falhou para ${t.id}:`, errMarca);
          continue;
        }

        // 2. Atualiza campos específicos do ciclo boleto
        const { error: errBoleto } = await sb
          .from("titulo_a_receber")
          .update({ boleto_status: "pago_banco", data_pagamento_banco: agora })
          .eq("id", t.id);
        if (errBoleto) {
          console.error(`[retorno-safra] update boleto_status falhou para ${t.id}:`, errBoleto);
        }

        // 3. Grava crédito no razão financeiro — idempotente via hash_unico (23505 = já gravado, ok)
        if (safraConta) {
          const { error: errMov } = await sb
            .from("movimentacoes_bancarias")
            .insert({
              conta_bancaria_id:  safraConta.id,
              data_transacao:     agora.slice(0, 10),
              descricao:          `Boleto ${t.numero_titulo ?? t.nosso_numero_seq ?? "s/n"} — ${parceiro?.razao_social ?? "Cliente"}`,
              valor:              Number(t.valor_bruto),
              tipo:               "credito",
              origem:             "csv_safra",
              hash_unico:         `safra_boleto_${t.id}`,
              id_transacao_banco: linha.nossoNumero || null,
              conciliado:         true,
              conciliado_em:      agora,
            });
          if (errMov && errMov.code !== "23505") {
            console.error(`[retorno-safra] insert movimentacao_bancaria falhou para ${t.id}:`, errMov);
          }
        }

        // 4. Avança pedido para pre_faturado (non-fatal)
        if (t.pedido_id) {
          const { error: errTransicao } = await sb.rpc("transicionar_pedido" as string, {
            p_pedido_id: t.pedido_id,
            p_para_estagio: "pre_faturado",
            p_proxima_acao: "Pronto pra enviar pro Bling",
            p_motivo: `Liquidação confirmada pelo Safra — ocorrência ${linha.ocorrencia}`,
          });
          if (errTransicao) {
            console.warn(`[retorno-safra] transicionar_pedido falhou para ${t.pedido_id}:`, errTransicao);
          }
        }

        liquidados++;

      // ── Rejeições ─────────────────────────────────────────────────────────
      } else if (OCORRENCIAS_REJEICAO.includes(linha.ocorrencia) || linha.motivoRejeicao !== "000") {
        await sb.from("titulo_a_receber")
          .update({ boleto_status: "rejeitado", boleto_codigo_rejeicao: linha.motivoRejeicao })
          .eq("id", t.id);
        rejeitados++;
        detalhesRejeicao.push({
          numero_titulo:   t.numero_titulo,
          parceiro_nome:   parceiro?.razao_social ?? "—",
          codigo_rejeicao: linha.motivoRejeicao,
          motivo:          descricaoRejeicao(linha.motivoRejeicao),
        });
      }
    }

    if (remessaId) {
      await sb.from("remessas_safra").update({
        status: rejeitados > 0 ? "com_rejeicoes" : "processada",
        retorno_processado_em: new Date().toISOString(),
      }).eq("id", remessaId);
    }

    return new Response(
      JSON.stringify({ ok: true, confirmados, liquidados, rejeitados, emails_enviados: emailsEnviados, detalhes_rejeicao: detalhesRejeicao, remessa_id: remessaId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("processar-retorno-safra erro fatal", e);
    return new Response(
      JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
