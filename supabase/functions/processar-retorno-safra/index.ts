import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═════════════════════════════════════════════════════════════════════════
// parse de linhas de detalhe do retorno CNAB 400 Safra
// ═════════════════════════════════════════════════════════════════════════

interface LinhaRetorno {
  numeroLinha: number;
  ocorrencia: string;      // pos 109-110
  seuNumero: string;       // pos 117-126
  nossoNumero: string;     // pos 63-71
  motivoRejeicao: string;  // pos 105-107
  dataCreditoRaw: string;  // pos 296-301 (DDMMAA)
  dataVencRaw: string;     // pos 147-152 (DDMMAA)
  valorTituloRaw: string;  // pos 153-165 (13 dígitos, 2 decimais)
  descontoRaw: string;     // pos 241-253 (13 dígitos, 2 decimais)
  valorPagoRaw: string;    // pos 254-266 (13 dígitos, 2 decimais)
  jurosMoraRaw: string;    // pos 267-279 (13 dígitos, 2 decimais)
}

function parseLinha(linha: string, numeroLinha: number): LinhaRetorno | null {
  if (linha.length < 400 || linha[0] !== "1") return null;
  const nnRaw = linha.substring(62, 71).trim();
  return {
    numeroLinha,
    nossoNumero: nnRaw.replace(/^0+/, "") || nnRaw,
    motivoRejeicao: linha.substring(104, 107).trim(),
    ocorrencia:     linha.substring(108, 110).trim(),
    seuNumero:      linha.substring(116, 126).trim(),
    dataVencRaw:    linha.substring(146, 152).trim(),
    valorTituloRaw: linha.substring(152, 165).trim(),
    descontoRaw:    linha.substring(240, 253).trim(),
    valorPagoRaw:   linha.substring(253, 266).trim(),
    jurosMoraRaw:   linha.substring(266, 279).trim(),
    dataCreditoRaw: linha.substring(295, 301).trim(),
  };
}

function parseDDMMAA(s: string): string | null {
  if (!/^\d{6}$/.test(s) || s === "000000") return null;
  const dd = s.slice(0, 2), mm = s.slice(2, 4), aa = s.slice(4, 6);
  const dNum = parseInt(dd, 10), mNum = parseInt(mm, 10);
  if (dNum < 1 || dNum > 31 || mNum < 1 || mNum > 12) return null;
  return `20${aa}-${mm}-${dd}`;
}

function parseValor13d2(s: string): number | null {
  if (!/^\d{1,13}$/.test(s)) return null;
  const padded = s.padStart(13, "0");
  const inteiros = padded.slice(0, 11);
  const decimais = padded.slice(11);
  const v = parseInt(inteiros, 10) + parseInt(decimais, 10) / 100;
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

// ─── Helpers de código de barras (copiados de gerar-remessa-safra) ──────────

function dvMod10(numero: string): number {
  let soma = 0, mult = 2;
  for (const d of [...numero].reverse()) {
    const v = parseInt(d) * mult;
    soma += Math.floor(v / 10) + (v % 10);
    mult = mult === 2 ? 1 : 2;
  }
  return (10 - soma % 10) % 10;
}

function dvGeralMod11(barras43: string): number {
  let soma = 0, mult = 2;
  for (const d of [...barras43].reverse()) {
    soma += parseInt(d) * mult;
    mult = mult < 9 ? mult + 1 : 2;
  }
  const resto = soma % 11;
  return resto <= 1 ? 1 : 11 - resto;
}

function fatorVencimento(vencimentoIso: string): number {
  const base = new Date("2022-05-29T00:00:00");
  const venc = new Date(vencimentoIso + "T00:00:00");
  return Math.round((venc.getTime() - base.getTime()) / 86400000);
}

function montarLinhaDigitavel(
  nossoNumero: string,
  vencimentoIso: string,
  valorCents: number,
  params: Record<string, string>
): { linha: string; barras: string } {
  const agencia  = params.agencia ?? "0005";
  const conta7d  = params.conta_7d ?? "5804446";
  const c1Base   = params.campo1_fixo ?? "422970050";
  const sufixoC3 = params.sufixo_campo3 ?? "2";

  const agencia5d = agencia.padStart(5, "0");
  const conta9d   = conta7d.padStart(9, "0");
  const c2Base    = agencia5d.slice(-1) + conta9d;
  const c3Base    = nossoNumero + sufixoC3;

  const dv1 = dvMod10(c1Base);
  const dv2 = dvMod10(c2Base);
  const dv3 = dvMod10(c3Base);

  const fator    = fatorVencimento(vencimentoIso);
  const fatorStr = String(fator).padStart(4, "0");
  const valorStr = String(valorCents).padStart(10, "0");
  const campoLivre = c1Base.slice(4) + c2Base + c3Base;

  const barras43 = "4229" + fatorStr + valorStr + campoLivre;
  const dvGeral  = dvGeralMod11(barras43);
  const barras   = barras43.slice(0, 4) + dvGeral + barras43.slice(4);

  const linha = (
    `${c1Base.slice(0, 5)}.${c1Base.slice(5)}${dv1} ` +
    `${c2Base.slice(0, 5)}.${c2Base.slice(5)}${dv2} ` +
    `${c3Base.slice(0, 5)}.${c3Base.slice(5)}${dv3} ` +
    `${dvGeral} ${fatorStr}${valorStr}`
  );

  return { linha, barras };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const arquivoConteudo: string = body.arquivo_conteudo ?? "";
    if (!arquivoConteudo) {
      return new Response(JSON.stringify({ ok: false, erro: "arquivo_conteudo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── carrega dimensão de ocorrências (fonte da verdade) ─────────────────
    const { data: dims, error: dimsErr } = await sb
      .from("safra_ocorrencias_retorno")
      .select("codigo, categoria, descricao, ativo, gera_data_credito");
    if (dimsErr) {
      return new Response(JSON.stringify({ ok: false, erro: `Falha ao carregar dimensão: ${dimsErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // deno-lint-ignore no-explicit-any
    const mapaOcorrencias = new Map<string, any>((dims ?? []).map((d: any) => [d.codigo, d]));

    // ── carrega dimensão de motivos de rejeição (para relatório) ───────────
    const { data: mots } = await sb.from("safra_motivos_rejeicao").select("codigo, descricao");
    const mapaMotivos = new Map<string, string>((mots ?? []).map((m: { codigo: string; descricao: string }) => [m.codigo, m.descricao]));
    const descricaoRejeicao = (cod: string) => mapaMotivos.get(cod) ?? `Código de rejeição ${cod}`;

    const linhasBrutas = arquivoConteudo.split(/\r?\n/);
    const detalhes: LinhaRetorno[] = [];
    linhasBrutas.forEach((l, i) => {
      const parsed = parseLinha(l, i + 1);
      if (parsed) detalhes.push(parsed);
    });
    if (detalhes.length === 0) {
      return new Response(JSON.stringify({ ok: false, erro: "Nenhuma linha de detalhe encontrada" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── promoção da remessa: vínculo real via título (não via header) ──────
    const remessasTocadas = new Set<string>();
    const remessasComRejeicao = new Set<string>();


    // ── conta bancária Safra p/ movimentacoes_bancarias ────────────────────
    const { data: safraConta } = await sb
      .from("contas_bancarias").select("id").eq("banco_codigo", "422").eq("ativo", true).maybeSingle();
    if (!safraConta) {
      console.warn("[retorno-safra] Conta bancária Safra (422) não encontrada — movimentacoes_bancarias não serão gravadas");
    }

    // ── parâmetros de remessa (para recálculo de código de barras) ─────────
    const { data: paramRows } = await sb.from("parametros_remessa_safra").select("chave, valor");
    const params: Record<string, string> = {};
    for (const row of (paramRows ?? []) as { chave: string; valor: string }[]) params[row.chave] = row.valor;

    // ── contadores + relatório ─────────────────────────────────────────────
    const contadores = {
      registros: 0, rejeicoes: 0, liquidacoes: 0, baixas: 0,
      alteracoes: 0, informativos: 0, ignoradas: 0,
    };
    const alertas: string[] = [];
    const erros: Array<{ linha: number; nosso_numero: string; erro: string }> = [];
    const infoInformativos: Record<string, number> = {};
    const detalhesRejeicao: Array<{ numero_titulo: string; parceiro_nome: string; codigo_rejeicao: string; motivo: string }> = [];

    for (const linha of detalhes) {
      try {
        const dim = mapaOcorrencias.get(linha.ocorrencia);

        // ── ocorrência desconhecida OU inativa ────────────────────────────
        if (!dim || dim.ativo === false) {
          contadores.ignoradas++;
          alertas.push(
            `Ocorrência ${linha.ocorrencia} (${dim?.descricao ?? "desconhecida"}) ignorada — título ${linha.nossoNumero}.`
          );
          continue;
        }

        const categoria = dim.categoria as string;

        // ── informativo: só conta ──────────────────────────────────────────
        if (categoria === "informativo") {
          contadores.informativos++;
          infoInformativos[linha.ocorrencia] = (infoInformativos[linha.ocorrencia] ?? 0) + 1;
          continue;
        }

        // ── busca do título (necessário para todos os branches restantes) ─
        const { data: titulo, error: tErr } = await sb
          .from("titulo_a_receber")
          .select(`
            id, numero_titulo, numero_parcela, total_parcelas,
            valor_bruto, data_vencimento_atual, boleto_status, pedido_id,
            nosso_numero_seq, linha_digitavel, codigo_barras_boleto,
            prorrogacao_nova_data, prorrogacao_solicitada_em,
            reemissao_nova_data, remessa_safra_id,
            conta:contas_pagar_receber(
              parceiro:parceiros_comerciais(razao_social, email)
            )
          `)
              parceiro:parceiros_comerciais(razao_social, email)
            )
          `)
          .eq("nosso_numero_seq", linha.nossoNumero)
          .maybeSingle();

        if (tErr) {
          erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: tErr.message });
          continue;
        }

        // Título não encontrado: para BAIXA é esperado (reemissão); demais viram alerta.
        if (!titulo) {
          if (categoria === "baixa") {
            contadores.baixas++;
            alertas.push(`Baixa (${linha.ocorrencia}) para nosso número ${linha.nossoNumero} — título não encontrado (provável reemissão anterior).`);
          } else {
            alertas.push(`Título não encontrado para ocorrência ${linha.ocorrencia} — nosso número ${linha.nossoNumero}.`);
          }
          continue;
        }

        // deno-lint-ignore no-explicit-any
        const t = titulo as any;
        const parceiro = t.conta?.parceiro;

        // ═══════════════════════════════════════════════════════════════════
        // REGISTRO (02)  — comportamento preservado
        // ═══════════════════════════════════════════════════════════════════
        if (categoria === "registro") {
          await sb.from("titulo_a_receber").update({ boleto_status: "registrado" }).eq("id", t.id);
          contadores.registros++;
          continue;
        }

        // ═══════════════════════════════════════════════════════════════════
        // REJEIÇÃO (03)  — comportamento preservado
        // ═══════════════════════════════════════════════════════════════════
        if (categoria === "rejeicao") {
          // Rejeição de instrução de prorrogação (motivos 083, 112, 119)
          // O boleto original segue válido — só a instrução falhou
          if (
            t.prorrogacao_solicitada_em !== null &&
            ["083", "112", "119"].includes(linha.motivoRejeicao)
          ) {
            await sb.from("titulo_a_receber")
              .update({
                prorrogacao_nova_data:     null,
                prorrogacao_solicitada_em: null,
              } as any)
              .eq("id", t.id);
            const descMotivo = descricaoRejeicao(linha.motivoRejeicao);
            await sb.from("titulo_instrumento_log").insert({
              titulo_id: t.id,
              evento: "prorrogacao_rejeitada",
              detalhe: `Motivo ${linha.motivoRejeicao}: ${descMotivo}`,
              origem: "retorno_safra",
            } as any);
            alertas.push(
              `⚠ Prorrogação rejeitada (motivo ${linha.motivoRejeicao}: ${descMotivo}) — boleto original permanece válido. Considere reemissão para o título ${linha.nossoNumero}.`
            );
            contadores.rejeicoes++;
            continue;
          }
          await sb.from("titulo_a_receber")
            .update({ boleto_status: "rejeitado", boleto_codigo_rejeicao: linha.motivoRejeicao })
            .eq("id", t.id);
          contadores.rejeicoes++;
          detalhesRejeicao.push({
            numero_titulo:   t.numero_titulo,
            parceiro_nome:   parceiro?.razao_social ?? "—",
            codigo_rejeicao: linha.motivoRejeicao,
            motivo:          descricaoRejeicao(linha.motivoRejeicao),
          });
          continue;
        }

        // ═══════════════════════════════════════════════════════════════════
        // LIQUIDAÇÃO (06, 15, 41)
        // ═══════════════════════════════════════════════════════════════════
        if (categoria === "liquidacao") {
          if (t.boleto_status === "pago_manual") {
            alertas.push(
              `⚠ POSSÍVEL PAGAMENTO EM DOBRO: título ${t.nosso_numero_seq ?? t.numero_titulo} já estava baixado manualmente e o banco reportou liquidação. Confira o extrato e trate reembolso se necessário.`,
            );
            contadores.liquidacoes++;
            continue;
          }

          // Data de pagamento: prefere data de crédito do arquivo quando dim.gera_data_credito.
          const agoraIso = new Date().toISOString();
          let dataPagamentoIso = agoraIso;
          if (dim.gera_data_credito) {
            const dc = parseDDMMAA(linha.dataCreditoRaw);
            if (dc) {
              dataPagamentoIso = `${dc}T12:00:00.000Z`;
            } else {
              alertas.push(`Data de crédito inválida/zerada para título ${linha.nossoNumero} — usando data do processamento.`);
            }
          }

          // A5: valores reais do arquivo de retorno
          const valorPagoArq = parseValor13d2(linha.valorPagoRaw);
          const jurosArq     = parseValor13d2(linha.jurosMoraRaw) ?? 0;
          const descontoArq  = parseValor13d2(linha.descontoRaw) ?? 0;

          let valorCreditado = Number(t.valor_bruto);
          if (valorPagoArq && valorPagoArq > 0 && valorPagoArq <= Number(t.valor_bruto) * 3) {
            valorCreditado = valorPagoArq;
          } else if (valorPagoArq !== null && valorPagoArq !== 0) {
            alertas.push(`⚠ Valor pago fora do esperado no título ${linha.nossoNumero} (arquivo: ${valorPagoArq}) — movimentação lançada pelo valor nominal. Validar layout.`);
          }

          const { error: errMarca } = await sb.rpc("marcar_titulo_pago" as string, {
            p_titulo_id: t.id,
            p_data_pagamento: dataPagamentoIso,
          });
          if (errMarca) {
            erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: `marcar_titulo_pago: ${errMarca.message}` });
            continue;
          }

          const { error: errBoleto } = await sb
            .from("titulo_a_receber")
            .update({
              boleto_status: "pago_banco",
              data_pagamento_banco: dataPagamentoIso,
              valor_juros: jurosArq,
              valor_desconto: descontoArq,
            } as any)
            .eq("id", t.id);
          if (errBoleto) {
            erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: `update boleto: ${errBoleto.message}` });
          }

          if (jurosArq > 0) {
            alertas.push(`Título ${linha.nossoNumero} liquidado com R$ ${jurosArq.toFixed(2)} de juros de mora — creditado R$ ${valorCreditado.toFixed(2)}.`);
          }

          if (safraConta) {
            const { error: errMov } = await sb
              .from("movimentacoes_bancarias")
              .insert({
                conta_bancaria_id:  safraConta.id,
                data_transacao:     dataPagamentoIso.slice(0, 10),
                descricao:          `Boleto ${t.numero_titulo ?? t.nosso_numero_seq ?? "s/n"} — ${parceiro?.razao_social ?? "Cliente"}`,
                valor:              valorCreditado,
                tipo:               "credito",
                origem:             "csv_safra",
                hash_unico:         `safra_boleto_${t.id}`,
                id_transacao_banco: linha.nossoNumero || null,
                conciliado:         true,
                conciliado_em:      new Date().toISOString(),
              });
            if (errMov && errMov.code !== "23505") {
              erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: `mov bancária: ${errMov.message}` });
            }
          }

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

          contadores.liquidacoes++;
          continue;
        }

        // ═══════════════════════════════════════════════════════════════════
        // BAIXA (09, 10, 40)  — NUNCA é pagamento
        // ═══════════════════════════════════════════════════════════════════
        if (categoria === "baixa") {
          if (t.boleto_status === "pago_manual" || t.boleto_status === "pago_banco") {
            alertas.push(
              `⚠ Baixa (${linha.ocorrencia}) recebida para título ${linha.nossoNumero} já ${t.boleto_status} — verificar.`
            );
            contadores.baixas++;
            continue;
          }

          const nnAntes = t.nosso_numero_seq;
          const dataAntes = t.data_vencimento_atual;
          const tinhaReemissao = !!t.reemissao_nova_data;

          await sb.from("titulo_a_receber")
            .update({ boleto_status: "baixado_banco" })
            .eq("id", t.id);

          if (tinhaReemissao) {
            // Após a baixa, o trigger aplica a reemissão. Registra no log.
            const { data: tAtual } = await sb
              .from("titulo_a_receber")
              .select("nosso_numero_seq, data_vencimento_atual")
              .eq("id", t.id)
              .maybeSingle() as any;
            await sb.from("titulo_instrumento_log").insert({
              titulo_id: t.id,
              evento: "reemissao_aplicada",
              data_anterior: dataAntes,
              data_nova: tAtual?.data_vencimento_atual ?? t.reemissao_nova_data,
              nosso_numero_anterior: nnAntes,
              nosso_numero_novo: tAtual?.nosso_numero_seq ?? null,
              detalhe: "Reemissão aplicada após baixa confirmada",
              origem: "retorno_safra",
            } as any);
          }

          if (linha.ocorrencia === "09") {
            alertas.push(
              `⚠ Baixa automática pelo banco — título ${linha.nossoNumero}. Ação não solicitada pelo SNCF, verificar com o banco.`
            );
          }
          contadores.baixas++;
          continue;
        }

        // ═══════════════════════════════════════════════════════════════════
        // ALTERAÇÃO (14 vencimento / 51 valor nominal)
        // ═══════════════════════════════════════════════════════════════════
        if (categoria === "alteracao") {
          if (linha.ocorrencia === "14") {
            const novaData = parseDDMMAA(linha.dataVencRaw);
            if (!novaData) {
              erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: "Data de vencimento inválida na alteração 14" });
              continue;
            }

            // Recalcula linha digitável e código de barras com a NOVA data
            // (o fator de vencimento faz parte do código de barras)
            const valorCents = Math.round(Number(t.valor_bruto) * 100);
            const { linha: novaLinhaDigitavel, barras: novoCodigoBarras } =
              montarLinhaDigitavel(String(t.nosso_numero_seq), novaData, valorCents, params);

            const dataAnteriorVenc = t.data_vencimento_atual;
            const tinhaProrrogPendente = t.prorrogacao_nova_data !== null || t.prorrogacao_solicitada_em !== null;
            const hojeIso = new Date().toISOString().slice(0, 10);
            const reativarBoleto = t.boleto_status === "vencido" && novaData >= hojeIso;

            const updatePayload: Record<string, unknown> = {
              data_vencimento_atual:      novaData,
              linha_digitavel:            novaLinhaDigitavel,
              codigo_barras_boleto:       novoCodigoBarras,
              prorrogacao_nova_data:      null,
              prorrogacao_solicitada_em:  null,
            };
            if (reativarBoleto) updatePayload.boleto_status = "registrado";

            await sb.from("titulo_a_receber")
              .update(updatePayload as any)
              .eq("id", t.id);

            const eventoLog = tinhaProrrogPendente ? "prorrogacao_confirmada" : "vencimento_alterado";
            await sb.from("titulo_instrumento_log").insert({
              titulo_id: t.id,
              evento: eventoLog,
              data_anterior: dataAnteriorVenc,
              data_nova: novaData,
              detalhe: "Retorno Safra ocorrência 14",
              origem: "retorno_safra",
            } as any);

            if (reativarBoleto) {
              await sb.from("titulo_instrumento_log").insert({
                titulo_id: t.id,
                evento: "boleto_reativado",
                data_anterior: dataAnteriorVenc,
                data_nova: novaData,
                detalhe: "Boleto vencido reativado após prorrogação",
                origem: "retorno_safra",
              } as any);
              alertas.push(`Boleto reativado — título ${linha.nossoNumero} voltou ao status registrado após prorrogação.`);
            }

            alertas.push(`Prorrogação confirmada — novo vencimento ${novaData} — título ${linha.nossoNumero}. Código de barras recalculado. PDF do boleto deve ser regenerado antes do reenvio ao cliente.`);
            contadores.alteracoes++;
            continue;
          }
          if (linha.ocorrencia === "51") {
            const novoValor = parseValor13d2(linha.valorTituloRaw);
            if (!novoValor) {
              erros.push({ linha: linha.numeroLinha, nosso_numero: linha.nossoNumero, erro: "Valor inválido na alteração 51" });
              continue;
            }
            await sb.from("titulo_a_receber")
              // deno-lint-ignore no-explicit-any
              .update({ valor_atual: novoValor } as any)
              .eq("id", t.id);
            alertas.push(`Valor alterado para ${novoValor.toFixed(2)} — título ${linha.nossoNumero}.`);
            contadores.alteracoes++;
            continue;
          }
          // Outras alterações categorizadas: só contar
          contadores.alteracoes++;
          continue;
        }

        // fallback: categoria não prevista
        contadores.ignoradas++;
        alertas.push(`Categoria "${categoria}" não tratada (ocorrência ${linha.ocorrencia}) — título ${linha.nossoNumero}.`);
      } catch (e) {
        erros.push({
          linha: linha.numeroLinha,
          nosso_numero: linha.nossoNumero,
          erro: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (remessaId) {
      await sb.from("remessas_safra").update({
        status: contadores.rejeicoes > 0 ? "com_rejeicoes" : "processada",
        retorno_processado_em: new Date().toISOString(),
      }).eq("id", remessaId);
    }

    // Compat: campos antigos consumidos pela UI (confirmados/liquidados/rejeitados/detalhes_rejeicao)
    return new Response(
      JSON.stringify({
        ok: true,
        // legacy
        confirmados: contadores.registros,
        liquidados:  contadores.liquidacoes,
        rejeitados:  contadores.rejeicoes,
        emails_enviados: 0,
        detalhes_rejeicao: detalhesRejeicao,
        remessa_id: remessaId,
        // novo relatório
        contadores,
        alertas,
        erros,
        informativos_por_codigo: infoInformativos,
      }),
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
